-- Server-only, atomic import. No connection is enabled and no contact is imported here.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.import_marketing_systeme_opt_in(
  p_integration_id uuid,
  p_secret_rotated_at timestamptz,
  p_message_id text,
  p_event_type text,
  p_payload_sha256 text,
  p_event_occurred_at timestamptz default null,
  p_source_page_url text default null,
  p_contact jsonb default null,
  p_rejection_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.marketing_systeme_integrations;
  v_event public.marketing_systeme_webhook_events;
  v_contact public.marketing_crm_contacts;
  v_secret_rotated_at timestamptz;
  v_profile_active boolean;
  v_has_access boolean;
  v_pipeline_id uuid;
  v_stage_id uuid;
  v_contact_id uuid;
  v_status text;
  v_reason text;
  v_email_count integer;
begin
  -- Serialize only imports for the same PM, including retries with different message IDs.
  select * into v_connection from public.marketing_systeme_integrations
  where id = p_integration_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;

  select rotated_at into v_secret_rotated_at from public.marketing_systeme_webhook_secrets
  where integration_id = p_integration_id for share;
  if not found or v_secret_rotated_at is distinct from p_secret_rotated_at then
    return jsonb_build_object('status', 'stale_secret');
  end if;

  select * into v_event from public.marketing_systeme_webhook_events
  where integration_id = p_integration_id and message_id = p_message_id;
  if found then
    if v_event.payload_sha256 <> p_payload_sha256 or v_event.event_type <> p_event_type then
      return jsonb_build_object('status', 'conflict');
    end if;
    if v_event.status <> 'failed' or v_event.reason_code not in ('import_failed', 'crm_not_ready') then
      return jsonb_build_object('status', 'duplicate');
    end if;
    update public.marketing_systeme_webhook_events
    set status = 'received', reason_code = null, processed_at = null
    where id = v_event.id;
  else
    insert into public.marketing_systeme_webhook_events (
      integration_id, profile_id, message_id, event_type, payload_sha256,
      external_contact_id, source_page_url, event_occurred_at
    ) values (
      p_integration_id, v_connection.profile_id, p_message_id, p_event_type, p_payload_sha256,
      p_contact->>'external_id', p_source_page_url, p_event_occurred_at
    ) returning * into v_event;
  end if;

  select status = 'active' into v_profile_active from public.profiles
  where id = v_connection.profile_id;

  -- Same entitlement rules as the Marketing addon: manual, trial, active, or valid grace access.
  select exists (
    select 1 from public.user_roles role
    where role.profile_id = v_connection.profile_id and (
      role.role = 'super_admin' or (role.role = 'property_manager' and exists (
        select 1 from public.addon_subscriptions subscription
        join public.addon_products product on product.id = subscription.addon_product_id
        where subscription.profile_id = v_connection.profile_id and product.slug = 'marketing'
          and (
            (subscription.source = 'manual' and subscription.status = 'active'
              and (subscription.access_expires_at is null or subscription.access_expires_at > now()))
            or (subscription.source = 'stripe' and (
              subscription.status = 'active'
              or (subscription.status = 'trialing' and (subscription.trial_ends_at is null or subscription.trial_ends_at > now()))
              or (subscription.status = 'past_due' and subscription.current_period_ends_at > now())
            ))
          )
      ))
    )
  ) into v_has_access;

  if not v_connection.enabled then v_reason := 'connection_disabled';
  elsif not coalesce(v_profile_active, false) then v_reason := 'profile_inactive';
  elsif not v_has_access then v_reason := 'marketing_access_required';
  elsif p_event_type <> 'CONTACT_OPT_IN' then v_reason := 'unsupported_event';
  elsif p_rejection_reason is not null then v_reason := p_rejection_reason;
  elsif p_contact is null or jsonb_typeof(p_contact) <> 'object' then v_reason := 'invalid_payload';
  elsif v_connection.import_mode = 'selected_pages' and p_source_page_url is null then v_reason := 'source_page_missing';
  elsif v_connection.import_mode = 'selected_pages' and not (p_source_page_url = any(v_connection.allowed_page_urls)) then
    v_reason := 'page_filtered';
  end if;

  if v_reason is not null then
    v_status := case when v_reason in ('invalid_payload', 'missing_name') then 'failed' else 'ignored' end;
  else
    begin
      select id into v_pipeline_id from public.marketing_crm_pipelines
      where profile_id = v_connection.profile_id and is_default for share;
      if v_pipeline_id is not null then
        select id into v_stage_id from public.marketing_crm_stages
        where pipeline_id = v_pipeline_id
          and (v_connection.destination_stage_id is null or id = v_connection.destination_stage_id)
        order by position, created_at, id limit 1 for share;
      end if;

      if v_pipeline_id is null or v_stage_id is null then
        v_status := 'failed'; v_reason := 'crm_not_ready';
      else
        select contact.* into v_contact from public.marketing_systeme_contact_links link
        join public.marketing_crm_contacts contact on contact.id = link.crm_contact_id
        where link.integration_id = p_integration_id and link.external_contact_id = p_contact->>'external_id'
          and contact.profile_id = v_connection.profile_id
        for update of contact;

        if v_contact.id is null then
          select count(*) into v_email_count from public.marketing_crm_contacts
          where profile_id = v_connection.profile_id and pipeline_id = v_pipeline_id
            and lower(btrim(email)) = p_contact->>'email';
          if v_email_count > 1 then
            v_status := 'failed'; v_reason := 'ambiguous_contact';
          elsif v_email_count = 1 then
            select * into v_contact from public.marketing_crm_contacts
            where profile_id = v_connection.profile_id and pipeline_id = v_pipeline_id
              and lower(btrim(email)) = p_contact->>'email'
            for update;
          end if;
        end if;

        if v_status is null then
          if v_contact.id is null then
            insert into public.marketing_crm_contacts (
              profile_id, pipeline_id, stage_id, full_name, email, phone,
              property_address, city, province, region, property_type, position
            ) values (
              v_connection.profile_id, v_pipeline_id, v_stage_id,
              p_contact->>'full_name', p_contact->>'email', p_contact->>'phone',
              p_contact->>'property_address', p_contact->>'city', p_contact->>'province',
              p_contact->>'region', p_contact->>'property_type',
              (select coalesce(max(position), -1) + 1 from public.marketing_crm_contacts where stage_id = v_stage_id)
            ) returning id into v_contact_id;
            v_status := 'imported';
          else
            v_contact_id := v_contact.id;
            -- Preserve the PM's name, notes, stage and follow-up work. Only fill empty fields.
            update public.marketing_crm_contacts set
              email = coalesce(nullif(btrim(email), ''), p_contact->>'email'),
              phone = coalesce(nullif(btrim(phone), ''), p_contact->>'phone'),
              property_address = coalesce(nullif(btrim(property_address), ''), p_contact->>'property_address'),
              city = coalesce(nullif(btrim(city), ''), p_contact->>'city'),
              province = coalesce(nullif(btrim(province), ''), p_contact->>'province'),
              region = coalesce(nullif(btrim(region), ''), p_contact->>'region'),
              property_type = coalesce(nullif(btrim(property_type), ''), p_contact->>'property_type')
            where id = v_contact_id and profile_id = v_connection.profile_id;
            v_status := 'updated';
          end if;

          insert into public.marketing_systeme_contact_links (
            integration_id, profile_id, external_contact_id, crm_contact_id, last_opt_in_at
          ) values (
            p_integration_id, v_connection.profile_id, p_contact->>'external_id', v_contact_id,
            coalesce(p_event_occurred_at, now())
          ) on conflict (integration_id, external_contact_id) do update
          set last_opt_in_at = greatest(marketing_systeme_contact_links.last_opt_in_at, excluded.last_opt_in_at);
        end if;
      end if;
    exception when others then
      -- Roll back contact and link writes together, leaving a retryable outcome in the log.
      v_status := 'failed'; v_reason := 'import_failed'; v_contact_id := null;
    end;
  end if;

  update public.marketing_systeme_webhook_events
  set status = v_status, reason_code = v_reason, crm_contact_id = v_contact_id, processed_at = now()
  where id = v_event.id;
  return jsonb_build_object(
    'status', v_status, 'reason', v_reason,
    'retryable', coalesce(v_reason in ('import_failed', 'crm_not_ready'), false)
  );
end;
$$;

revoke all on function public.import_marketing_systeme_opt_in(uuid, timestamptz, text, text, text, timestamptz, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.import_marketing_systeme_opt_in(uuid, timestamptz, text, text, text, timestamptz, text, jsonb, text)
  to service_role;

commit;
