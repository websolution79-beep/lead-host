-- Versioned, server-only backend. Does not enable connections or switch existing routing modes.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.marketing_systeme_integrations add column if not exists configuration_revision bigint not null default 0;

create or replace function public.marketing_systeme_guard_legacy_settings()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.routing_mode = 'flows' and (new.enabled is distinct from old.enabled
    or new.import_mode is distinct from old.import_mode or new.allowed_page_urls is distinct from old.allowed_page_urls
    or new.destination_stage_id is distinct from old.destination_stage_id or new.routing_mode is distinct from old.routing_mode)
    and current_setting('leadhost.systeme_configuring', true) is distinct from old.id::text then
    raise exception 'Use versioned flow configuration' using errcode = '22023';
  end if;
  return new;
end;
$$;
drop trigger if exists marketing_systeme_guard_legacy_settings on public.marketing_systeme_integrations;
create trigger marketing_systeme_guard_legacy_settings before update on public.marketing_systeme_integrations
  for each row execute function public.marketing_systeme_guard_legacy_settings();

create or replace function public.marketing_systeme_lock_flow_config()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Also serialize direct service-side mapping writes with snapshots/imports.
  if tg_op = 'DELETE' then
    perform 1 from public.marketing_systeme_integrations where id = old.integration_id for update;
    return old;
  end if;
  perform 1 from public.marketing_systeme_integrations where id = new.integration_id for update;
  return new;
end;
$$;
drop trigger if exists marketing_systeme_binding_config_lock on public.marketing_systeme_field_bindings;
create trigger marketing_systeme_binding_config_lock before insert or update or delete on public.marketing_systeme_field_bindings
  for each row execute function public.marketing_systeme_lock_flow_config();
drop trigger if exists marketing_systeme_flow_delete_lock on public.marketing_systeme_flows;
create trigger marketing_systeme_flow_delete_lock before delete on public.marketing_systeme_flows
  for each row execute function public.marketing_systeme_lock_flow_config();

create or replace function public.marketing_systeme_owner_has_access(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = p_profile_id and p.status = 'active')
    and exists (
      select 1 from public.user_roles r where r.profile_id = p_profile_id and (
        r.role = 'super_admin' or (r.role = 'property_manager' and exists (
          select 1 from public.addon_subscriptions s
          join public.addon_products product on product.id = s.addon_product_id
          where s.profile_id = p_profile_id and product.slug = 'marketing' and (
            (s.source = 'manual' and s.status = 'active' and (s.access_expires_at is null or s.access_expires_at > now()))
            or (s.source = 'stripe' and (s.status = 'active'
              or (s.status = 'trialing' and (s.trial_ends_at is null or s.trial_ends_at > now()))
              or (s.status = 'past_due' and s.current_period_ends_at > now())))
          )
        ))
      )
    );
$$;

create or replace function public.marketing_systeme_flow_snapshot(p_integration_id uuid, p_profile_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_connection public.marketing_systeme_integrations; v_snapshot jsonb;
begin
  select * into v_connection from public.marketing_systeme_integrations
    where id = p_integration_id and profile_id = p_profile_id for share;
  if not found then return null; end if;
  select jsonb_build_object(
    'routingMode', v_connection.routing_mode, 'enabled', v_connection.enabled,
    'updatedAt', v_connection.updated_at, 'discoveryExpiresAt', v_connection.discovery_expires_at,
    'configurationRevision', v_connection.configuration_revision::text,
    'flows', coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'name', f.name, 'enabled', f.enabled, 'importMode', f.import_mode,
      'allowedPageUrls', f.allowed_page_urls, 'destinationStageId', f.destination_stage_id,
      'bindings', (select coalesce(jsonb_agg(jsonb_build_object(
        'sourceSlug', b.source_slug, 'targetField', b.target_field, 'additionalLabel', b.additional_label
      ) order by b.source_slug), '[]'::jsonb) from public.marketing_systeme_field_bindings b where b.flow_id = f.id)
    ) order by f.id) filter (where f.id is not null), '[]'::jsonb)
  ) into v_snapshot from public.marketing_systeme_flows f where f.integration_id = p_integration_id;
  return v_snapshot || jsonb_build_object('configurationToken', md5(v_snapshot::text));
end;
$$;

create or replace function public.marketing_systeme_discovery_catalog(p_integration_id uuid, p_profile_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('sourcePageUrl', f.source_page_url, 'sourceSlug', f.source_slug,
    'fieldLabel', f.field_label, 'firstSeenAt', f.first_seen_at, 'lastSeenAt', f.last_seen_at)
    order by f.source_page_url, f.source_slug), '[]'::jsonb)
  from (select source_page_url, source_slug, field_label, first_seen_at, last_seen_at
    from public.marketing_systeme_discovered_fields where integration_id = p_integration_id and profile_id = p_profile_id
    order by source_page_url, source_slug limit 1000) f;
$$;

create or replace function public.configure_marketing_systeme_flows(
  p_integration_id uuid, p_profile_id uuid, p_expected_token text, p_command jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_connection public.marketing_systeme_integrations; v_snapshot jsonb;
  v_flow jsonb; v_binding jsonb; v_id uuid; v_action text; v_enabled boolean; v_minutes integer; v_previous_guard text;
begin
  select * into v_connection from public.marketing_systeme_integrations
    where id = p_integration_id and profile_id = p_profile_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if not public.marketing_systeme_owner_has_access(p_profile_id) then return jsonb_build_object('status', 'access_denied'); end if;
  v_snapshot := public.marketing_systeme_flow_snapshot(p_integration_id, p_profile_id);
  if p_expected_token is distinct from v_snapshot->>'configurationToken' then return jsonb_build_object('status', 'conflict'); end if;
  v_previous_guard := current_setting('leadhost.systeme_configuring', true);
  perform set_config('leadhost.systeme_configuring', p_integration_id::text, true);
  v_action := p_command->>'action';
  if v_action = 'save_flow' then
    v_flow := p_command->'flow'; v_id := (v_flow->>'id')::uuid;
    if jsonb_typeof(v_flow) is distinct from 'object' or v_id is null
      or jsonb_typeof(v_flow->'bindings') is distinct from 'array' or jsonb_array_length(v_flow->'bindings') > 200
      or jsonb_typeof(v_flow->'enabled') is distinct from 'boolean'
    then raise exception 'Invalid flow configuration' using errcode = '22023'; end if;
    if exists(select 1 from public.marketing_systeme_flows where id = v_id and integration_id <> p_integration_id) then
      raise exception 'Invalid flow ownership' using errcode = '22023';
    end if;
    if not exists(select 1 from public.marketing_systeme_flows where id = v_id)
      and (select count(*) from public.marketing_systeme_flows where integration_id = p_integration_id) >= 20 then
      raise exception 'Flow limit reached' using errcode = '22023';
    end if;
    if v_flow->>'destinationStageId' is not null and not exists (
      select 1 from public.marketing_crm_stages s join public.marketing_crm_pipelines p on p.id = s.pipeline_id
      where s.id = (v_flow->>'destinationStageId')::uuid and p.profile_id = p_profile_id and p.is_default
    ) then raise exception 'Invalid destination stage' using errcode = '22023'; end if;
    if exists(select 1 from jsonb_array_elements(v_flow->'bindings') b where b->>'targetField' = 'full_name')
      and exists(select 1 from jsonb_array_elements(v_flow->'bindings') b where b->>'targetField' in ('first_name', 'last_name')) then
      raise exception 'Ambiguous name mapping' using errcode = '22023';
    end if;
    if (v_flow->>'enabled')::boolean and (
      not exists(select 1 from jsonb_array_elements(v_flow->'bindings') b where b->>'targetField' in ('full_name', 'first_name', 'last_name'))
      or not exists(select 1 from jsonb_array_elements(v_flow->'bindings') b where b->>'targetField' = 'email')
    ) then raise exception 'Required mappings missing' using errcode = '22023'; end if;
    if v_connection.routing_mode = 'legacy' then
      update public.marketing_systeme_flows set enabled = false where integration_id = p_integration_id and id <> v_id;
    end if;
    insert into public.marketing_systeme_flows(id, integration_id, profile_id, name, enabled, import_mode, allowed_page_urls, destination_stage_id)
      values(v_id, p_integration_id, p_profile_id, btrim(v_flow->>'name'), (v_flow->>'enabled')::boolean,
        v_flow->>'importMode', array(select jsonb_array_elements_text(v_flow->'allowedPageUrls')), (v_flow->>'destinationStageId')::uuid)
      on conflict(id) do update set name = excluded.name, enabled = excluded.enabled, import_mode = excluded.import_mode,
        allowed_page_urls = excluded.allowed_page_urls, destination_stage_id = excluded.destination_stage_id;
    delete from public.marketing_systeme_field_bindings where flow_id = v_id;
    for v_binding in select value from jsonb_array_elements(v_flow->'bindings') loop
      insert into public.marketing_systeme_field_bindings(flow_id, integration_id, profile_id, source_slug, target_field, additional_label)
        values(v_id, p_integration_id, p_profile_id, v_binding->>'sourceSlug', v_binding->>'targetField', v_binding->>'additionalLabel');
    end loop;
    -- Switching the first time requires a separate, explicit enable action after configuration.
    update public.marketing_systeme_integrations set routing_mode = 'flows',
      enabled = case when routing_mode = 'legacy' then false else enabled and exists(
        select 1 from public.marketing_systeme_flows where integration_id = p_integration_id and enabled
      ) end where id = p_integration_id;
  elsif v_action = 'delete_flow' then
    delete from public.marketing_systeme_flows where id = (p_command->>'flowId')::uuid and integration_id = p_integration_id;
    if not found then
      perform set_config('leadhost.systeme_configuring', coalesce(v_previous_guard, ''), true);
      return jsonb_build_object('status', 'not_found');
    end if;
    update public.marketing_systeme_integrations set enabled = enabled and exists(
      select 1 from public.marketing_systeme_flows where integration_id = p_integration_id and enabled
    ) where id = p_integration_id;
  elsif v_action = 'set_enabled' then
    if v_connection.routing_mode <> 'flows' or jsonb_typeof(p_command->'enabled') is distinct from 'boolean' then
      raise exception 'Configure flows first' using errcode = '22023';
    end if;
    v_enabled := (p_command->>'enabled')::boolean;
    if v_enabled and (
      not exists(select 1 from public.marketing_systeme_webhook_secrets where integration_id = p_integration_id)
      or not exists(select 1 from public.marketing_systeme_flows where integration_id = p_integration_id and enabled)
      or exists(select 1 from public.marketing_systeme_flows f where f.integration_id = p_integration_id and f.enabled and (
        not exists(select 1 from public.marketing_systeme_field_bindings b where b.flow_id = f.id and b.target_field in ('full_name', 'first_name', 'last_name'))
        or not exists(select 1 from public.marketing_systeme_field_bindings b where b.flow_id = f.id and b.target_field = 'email')
      ))
      or not exists(select 1 from public.marketing_crm_stages s join public.marketing_crm_pipelines p on p.id = s.pipeline_id
        where p.profile_id = p_profile_id and p.is_default)
    ) then raise exception 'Connection is not ready' using errcode = '22023'; end if;
    update public.marketing_systeme_integrations set enabled = v_enabled where id = p_integration_id;
  elsif v_action in ('start_discovery', 'stop_discovery') then
    v_minutes := coalesce((p_command->>'minutes')::integer, 15);
    if v_connection.routing_mode <> 'flows' or v_minutes not between 1 and 30 then
      raise exception 'Invalid discovery window' using errcode = '22023';
    end if;
    update public.marketing_systeme_integrations set discovery_expires_at = case when v_action = 'stop_discovery' then null
      else now() + make_interval(mins => v_minutes) end where id = p_integration_id;
  else raise exception 'Invalid configuration action' using errcode = '22023';
  end if;
  -- A real token changes even when two saves happen within the same database transaction.
  update public.marketing_systeme_integrations set configuration_revision = configuration_revision + 1 where id = p_integration_id;
  perform set_config('leadhost.systeme_configuring', coalesce(v_previous_guard, ''), true);
  return jsonb_build_object('status', 'saved', 'snapshot', public.marketing_systeme_flow_snapshot(p_integration_id, p_profile_id));
end;
$$;

-- Keep the original implementation intact behind a routing-mode guard for older clients.
do $$ begin
  if to_regprocedure('public.import_marketing_systeme_opt_in_legacy(uuid,timestamptz,text,text,text,timestamptz,text,jsonb,text)') is null then
    alter function public.import_marketing_systeme_opt_in(uuid,timestamptz,text,text,text,timestamptz,text,jsonb,text)
      rename to import_marketing_systeme_opt_in_legacy;
  end if;
end; $$;
create or replace function public.import_marketing_systeme_opt_in(
  p_integration_id uuid, p_secret_rotated_at timestamptz, p_message_id text, p_event_type text, p_payload_sha256 text,
  p_event_occurred_at timestamptz default null, p_source_page_url text default null, p_contact jsonb default null, p_rejection_reason text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_mode text;
begin
  select routing_mode into v_mode from public.marketing_systeme_integrations where id = p_integration_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v_mode <> 'legacy' then return jsonb_build_object('status', 'failed', 'reason', 'configuration_changed', 'retryable', true); end if;
  return public.import_marketing_systeme_opt_in_legacy(p_integration_id, p_secret_rotated_at, p_message_id, p_event_type,
    p_payload_sha256, p_event_occurred_at, p_source_page_url, p_contact, p_rejection_reason);
end;
$$;

create or replace function public.import_marketing_systeme_flow_opt_in(
  p_integration_id uuid, p_secret_rotated_at timestamptz, p_configuration_token text,
  p_message_id text, p_event_type text, p_payload_sha256 text,
  p_event_occurred_at timestamptz default null, p_source_page_url text default null, p_flow_id uuid default null,
  p_contact jsonb default null, p_additional_answers jsonb default '[]', p_warnings jsonb default '[]',
  p_discovered_fields jsonb default '[]', p_rejection_reason text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_connection public.marketing_systeme_integrations; v_flow public.marketing_systeme_flows;
  v_event public.marketing_systeme_webhook_events; v_contact public.marketing_crm_contacts;
  v_input public.marketing_crm_contacts; v_rotated_at timestamptz; v_snapshot jsonb;
  v_reason text; v_status text; v_pipeline_id uuid; v_stage_id uuid; v_contact_id uuid;
  v_email_count integer; v_access boolean; v_answer jsonb; v_field jsonb; v_slug text; v_label text;
begin
  select * into v_connection from public.marketing_systeme_integrations where id = p_integration_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select rotated_at into v_rotated_at from public.marketing_systeme_webhook_secrets where integration_id = p_integration_id for share;
  if not found or v_rotated_at is distinct from p_secret_rotated_at then return jsonb_build_object('status', 'stale_secret'); end if;
  select * into v_event from public.marketing_systeme_webhook_events where integration_id = p_integration_id and message_id = p_message_id;
  if found then
    if v_event.payload_sha256 <> p_payload_sha256 or v_event.event_type <> p_event_type then return jsonb_build_object('status', 'conflict'); end if;
    if v_event.status <> 'failed' or v_event.reason_code not in ('import_failed', 'crm_not_ready') then return jsonb_build_object('status', 'duplicate'); end if;
  end if;
  v_snapshot := public.marketing_systeme_flow_snapshot(p_integration_id, v_connection.profile_id);
  if v_connection.routing_mode <> 'flows' or p_configuration_token is distinct from v_snapshot->>'configurationToken' then
    return jsonb_build_object('status', 'failed', 'reason', 'configuration_changed', 'retryable', true);
  end if;
  select * into v_flow from public.marketing_systeme_flows where integration_id = p_integration_id
    and (import_mode = 'all' or p_source_page_url = any(allowed_page_urls))
    order by case when import_mode = 'selected_pages' then 0 else 1 end limit 1;
  v_access := public.marketing_systeme_owner_has_access(v_connection.profile_id);
  if not exists(select 1 from public.profiles where id = v_connection.profile_id and status = 'active') then v_reason := 'profile_inactive';
  elsif not v_access then v_reason := 'marketing_access_required';
  elsif p_event_type <> 'CONTACT_OPT_IN' then v_reason := 'unsupported_event';
  elsif not v_connection.enabled then v_reason := 'connection_disabled';
  elsif v_flow.id is null then v_reason := 'page_filtered';
  elsif not v_flow.enabled then v_reason := 'flow_paused';
  elsif p_rejection_reason is not null then v_reason := p_rejection_reason;
  elsif v_flow.id is distinct from p_flow_id then
    return jsonb_build_object('status', 'failed', 'reason', 'configuration_changed', 'retryable', true);
  elsif p_contact is null or jsonb_typeof(p_contact) <> 'object' then v_reason := 'invalid_payload';
  end if;
  if not public.marketing_systeme_warnings_valid(p_warnings) then raise exception 'Invalid warning metadata' using errcode = '22023'; end if;
  if jsonb_typeof(p_discovered_fields) is distinct from 'array' or jsonb_array_length(p_discovered_fields) > 201 then
    raise exception 'Invalid discovery metadata' using errcode = '22023';
  end if;
  if v_event.id is null then
    insert into public.marketing_systeme_webhook_events(integration_id, profile_id, message_id, event_type, payload_sha256,
      external_contact_id, source_page_url, event_occurred_at)
      values(p_integration_id, v_connection.profile_id, p_message_id, p_event_type, p_payload_sha256,
        p_contact->>'external_id', p_source_page_url, p_event_occurred_at) returning * into v_event;
  end if;

  begin
    -- Metadata collection requires a verified supported event, entitlement and an explicit active window.
    if v_access and p_event_type = 'CONTACT_OPT_IN' and v_connection.discovery_expires_at > now()
      and coalesce(p_rejection_reason, '') not in ('unsupported_schema', 'unsupported_event', 'invalid_payload') then
      for v_field in select value from jsonb_array_elements(p_discovered_fields) loop
        v_slug := v_field->>'sourceSlug'; v_label := v_field->>'fieldLabel';
        if jsonb_typeof(v_field) <> 'object' or v_field - 'sourceSlug' - 'fieldLabel' <> '{}'::jsonb
          or jsonb_typeof(v_field->'sourceSlug') is distinct from 'string'
          or char_length(v_slug) not between 1 and 160 or v_slug <> lower(btrim(v_slug))
          or (v_label is not null and (jsonb_typeof(v_field->'fieldLabel') <> 'string' or char_length(btrim(v_label)) not between 1 and 160))
        then continue; end if;
        if exists(select 1 from public.marketing_systeme_discovered_fields where integration_id = p_integration_id
          and source_page_url = coalesce(p_source_page_url, '') and source_slug = v_slug) then
          update public.marketing_systeme_discovered_fields set last_seen_at = greatest(last_seen_at, now()), field_label = coalesce(field_label, v_label)
            where integration_id = p_integration_id and source_page_url = coalesce(p_source_page_url, '') and source_slug = v_slug;
        elsif (select count(*) from public.marketing_systeme_discovered_fields where integration_id = p_integration_id) < 1000
          and (exists(select 1 from public.marketing_systeme_discovered_fields where integration_id = p_integration_id and source_page_url = coalesce(p_source_page_url, ''))
            or (select count(distinct source_page_url) from public.marketing_systeme_discovered_fields where integration_id = p_integration_id) < 50) then
          insert into public.marketing_systeme_discovered_fields(integration_id, profile_id, source_page_url, source_slug, field_label)
            values(p_integration_id, v_connection.profile_id, coalesce(p_source_page_url, ''), v_slug, v_label);
        end if;
      end loop;
    end if;
    if v_reason is null then
      if (p_contact - array['external_id','full_name','email','phone','property_address','city','province','region','property_type',
        'bedrooms','bathrooms','area_sqm','current_status','requested_services','timing','property_description']) <> '{}'::jsonb
        or coalesce(p_contact->>'external_id', '') !~ '^[0-9]{1,160}$'
        or coalesce(char_length(btrim(p_contact->>'full_name')), 0) not between 2 and 140
        or coalesce(p_contact->>'email', '') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        or jsonb_typeof(p_additional_answers) is distinct from 'array' or jsonb_array_length(p_additional_answers) > 200 then
        v_reason := 'invalid_payload';
      else
        v_input := jsonb_populate_record(null::public.marketing_crm_contacts, p_contact - 'external_id');
        select id into v_pipeline_id from public.marketing_crm_pipelines where profile_id = v_connection.profile_id and is_default for share;
        select id into v_stage_id from public.marketing_crm_stages where pipeline_id = v_pipeline_id
          and (v_flow.destination_stage_id is null or id = v_flow.destination_stage_id) order by position, created_at, id limit 1 for share;
        if v_pipeline_id is null or v_stage_id is null then v_reason := 'crm_not_ready';
        else
          select c.* into v_contact from public.marketing_systeme_contact_links l join public.marketing_crm_contacts c on c.id = l.crm_contact_id
            where l.integration_id = p_integration_id and l.external_contact_id = p_contact->>'external_id'
              and c.profile_id = v_connection.profile_id for update of c;
          if v_contact.id is null then
            select count(*) into v_email_count from public.marketing_crm_contacts where profile_id = v_connection.profile_id
              and pipeline_id = v_pipeline_id and lower(btrim(email)) = v_input.email;
            if v_email_count > 1 then v_reason := 'ambiguous_contact';
            elsif v_email_count = 1 then
              select * into v_contact from public.marketing_crm_contacts where profile_id = v_connection.profile_id
                and pipeline_id = v_pipeline_id and lower(btrim(email)) = v_input.email for update;
            end if;
          end if;
          if v_reason is null then
            if v_contact.id is null then
              insert into public.marketing_crm_contacts(profile_id, pipeline_id, stage_id, full_name, email, phone,
                property_address, city, province, region, property_type, bedrooms, bathrooms, area_sqm, current_status,
                requested_services, timing, property_description, position)
              values(v_connection.profile_id, v_pipeline_id, v_stage_id, v_input.full_name, v_input.email, v_input.phone,
                v_input.property_address, v_input.city, v_input.province, v_input.region, v_input.property_type,
                v_input.bedrooms, v_input.bathrooms, v_input.area_sqm, v_input.current_status,
                coalesce(v_input.requested_services, '{}'), v_input.timing, v_input.property_description,
                (select coalesce(max(position), -1) + 1 from public.marketing_crm_contacts where stage_id = v_stage_id))
                returning id into v_contact_id;
              v_status := 'imported';
            else
              v_contact_id := v_contact.id;
              update public.marketing_crm_contacts set
                email = coalesce(nullif(btrim(email), ''), v_input.email), phone = coalesce(nullif(btrim(phone), ''), v_input.phone),
                property_address = coalesce(nullif(btrim(property_address), ''), v_input.property_address),
                city = coalesce(nullif(btrim(city), ''), v_input.city), province = coalesce(nullif(btrim(province), ''), v_input.province),
                region = coalesce(nullif(btrim(region), ''), v_input.region), property_type = coalesce(nullif(btrim(property_type), ''), v_input.property_type),
                bedrooms = coalesce(bedrooms, v_input.bedrooms), bathrooms = coalesce(bathrooms, v_input.bathrooms), area_sqm = coalesce(area_sqm, v_input.area_sqm),
                current_status = coalesce(nullif(btrim(current_status), ''), v_input.current_status),
                requested_services = case when coalesce(cardinality(requested_services), 0) = 0 then coalesce(v_input.requested_services, '{}') else requested_services end,
                timing = coalesce(nullif(btrim(timing), ''), v_input.timing), property_description = coalesce(nullif(btrim(property_description), ''), v_input.property_description)
                where id = v_contact_id and profile_id = v_connection.profile_id;
              v_status := 'updated';
            end if;
            insert into public.marketing_systeme_contact_links(integration_id, profile_id, external_contact_id, crm_contact_id, last_opt_in_at)
              values(p_integration_id, v_connection.profile_id, p_contact->>'external_id', v_contact_id, coalesce(p_event_occurred_at, now()))
              on conflict(integration_id, external_contact_id) do update
                set last_opt_in_at = greatest(marketing_systeme_contact_links.last_opt_in_at, excluded.last_opt_in_at);
            for v_answer in select value from jsonb_array_elements(p_additional_answers) loop
              if jsonb_typeof(v_answer) <> 'object' or v_answer - 'fieldKey' - 'label' - 'value' <> '{}'::jsonb
                or jsonb_typeof(v_answer->'value') is distinct from 'string'
                or not exists(select 1 from public.marketing_systeme_field_bindings b where b.flow_id = v_flow.id and b.target_field = 'additional'
                  and v_answer->>'fieldKey' = v_flow.id::text || ':' || b.source_slug and v_answer->>'label' = b.additional_label)
              then raise exception 'Invalid additional answer' using errcode = '22023'; end if;
              insert into public.marketing_systeme_contact_fields(integration_id, profile_id, crm_contact_id, flow_id, flow_name, field_key, label, value)
                values(p_integration_id, v_connection.profile_id, v_contact_id, v_flow.id, v_flow.name, v_answer->>'fieldKey', v_answer->>'label', v_answer->>'value')
                on conflict(integration_id, crm_contact_id, field_key) do nothing;
            end loop;
          end if;
        end if;
      end if;
    end if;
    v_status := coalesce(v_status, case when v_reason in ('invalid_payload','missing_name','missing_email','invalid_email','ambiguous_contact','crm_not_ready') then 'failed' else 'ignored' end);
    insert into public.marketing_systeme_event_context(event_id, integration_id, profile_id, flow_id, flow_name, routing_mode, warnings)
      values(v_event.id, p_integration_id, v_connection.profile_id, v_flow.id, v_flow.name, 'flows', p_warnings)
      on conflict(event_id) do update set flow_id = excluded.flow_id, flow_name = excluded.flow_name, warnings = excluded.warnings;
  exception when others then
    -- Contact, identity link, answers, discovery and context roll back as a unit.
    v_status := 'failed'; v_reason := 'import_failed'; v_contact_id := null;
  end;
  update public.marketing_systeme_webhook_events set status = v_status, reason_code = v_reason, crm_contact_id = v_contact_id, processed_at = now() where id = v_event.id;
  return jsonb_build_object('status', v_status, 'reason', v_reason, 'retryable', coalesce(v_reason in ('import_failed','crm_not_ready'), false));
end;
$$;

revoke all on function public.marketing_systeme_owner_has_access(uuid),
  public.marketing_systeme_guard_legacy_settings(),
  public.marketing_systeme_lock_flow_config(),
  public.marketing_systeme_flow_snapshot(uuid,uuid), public.configure_marketing_systeme_flows(uuid,uuid,text,jsonb),
  public.marketing_systeme_discovery_catalog(uuid,uuid),
  public.import_marketing_systeme_opt_in(uuid,timestamptz,text,text,text,timestamptz,text,jsonb,text),
  public.import_marketing_systeme_opt_in_legacy(uuid,timestamptz,text,text,text,timestamptz,text,jsonb,text),
  public.import_marketing_systeme_flow_opt_in(uuid,timestamptz,text,text,text,text,timestamptz,text,uuid,jsonb,jsonb,jsonb,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.marketing_systeme_owner_has_access(uuid),
  public.marketing_systeme_guard_legacy_settings(),
  public.marketing_systeme_lock_flow_config(),
  public.marketing_systeme_flow_snapshot(uuid,uuid), public.configure_marketing_systeme_flows(uuid,uuid,text,jsonb),
  public.marketing_systeme_discovery_catalog(uuid,uuid),
  public.import_marketing_systeme_opt_in(uuid,timestamptz,text,text,text,timestamptz,text,jsonb,text),
  public.import_marketing_systeme_opt_in_legacy(uuid,timestamptz,text,text,text,timestamptz,text,jsonb,text),
  public.import_marketing_systeme_flow_opt_in(uuid,timestamptz,text,text,text,text,timestamptz,text,uuid,jsonb,jsonb,jsonb,jsonb,text)
  to service_role;
commit;
