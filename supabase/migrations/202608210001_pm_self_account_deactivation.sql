create table if not exists pm_account_deactivation_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete restrict,
  source text not null default 'self_service'
    check (source in ('self_service', 'admin')),
  reason text,
  previous_profile_status user_status not null,
  previous_verification_status pm_verification_status not null,
  evidence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence) = 'object'),
  created_at timestamptz not null default now(),
  check (reason is null or char_length(reason) <= 500)
);

create index if not exists pm_account_deactivation_events_profile_created_idx
  on pm_account_deactivation_events (profile_id, created_at desc);

alter table pm_account_deactivation_events enable row level security;

revoke all on pm_account_deactivation_events from anon, authenticated;

create or replace function self_deactivate_property_manager(
  p_profile_id uuid,
  p_reason text default null,
  p_policy_version text default '1.0',
  p_evidence jsonb default '{}'::jsonb
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_status user_status;
  v_verification_status pm_verification_status;
  v_deactivated_at timestamptz := now();
  v_campaign_id uuid;
begin
  if p_evidence is null or jsonb_typeof(p_evidence) <> 'object' then
    raise exception 'invalid_evidence';
  end if;

  if p_reason is not null and char_length(trim(p_reason)) > 500 then
    raise exception 'reason_too_long';
  end if;

  select p.status, pm.verification_status
  into v_profile_status, v_verification_status
  from profiles p
  join property_manager_profiles pm on pm.profile_id = p.id
  where p.id = p_profile_id
  for update of p, pm;

  if not found then
    raise exception 'property_manager_not_found';
  end if;

  if v_profile_status <> 'active' or v_verification_status = 'suspended' then
    raise exception 'account_already_inactive';
  end if;

  insert into pm_account_deactivation_events (
    profile_id,
    source,
    reason,
    previous_profile_status,
    previous_verification_status,
    evidence,
    created_at
  ) values (
    p_profile_id,
    'self_service',
    nullif(trim(p_reason), ''),
    v_profile_status,
    v_verification_status,
    p_evidence,
    v_deactivated_at
  );

  insert into email_preferences (
    profile_id,
    new_lead_frequency,
    transactional_enabled,
    created_at,
    updated_at
  ) values (
    p_profile_id,
    'off',
    false,
    v_deactivated_at,
    v_deactivated_at
  )
  on conflict (profile_id) do update
  set
    new_lead_frequency = 'off',
    transactional_enabled = false,
    updated_at = v_deactivated_at;

  perform record_pm_marketing_consent(
    p_profile_id,
    'withdrawn'::pm_marketing_consent_status,
    'account_self_deactivation',
    p_policy_version,
    jsonb_build_object('source', 'profile_self_service') || p_evidence,
    null
  );

  for v_campaign_id in
    select distinct campaign_id
    from service_email_recipients
    where profile_id = p_profile_id
      and status in ('queued', 'retry')
  loop
    update service_email_recipients
    set
      status = 'skipped',
      last_error = 'Account disattivato dal Property Manager.',
      locked_at = null,
      locked_by = null,
      updated_at = v_deactivated_at
    where campaign_id = v_campaign_id
      and profile_id = p_profile_id
      and status in ('queued', 'retry');

    update service_email_campaigns campaign
    set
      pending_count = (
        select count(*)::integer
        from service_email_recipients recipient
        where recipient.campaign_id = campaign.id
          and recipient.status in ('queued', 'processing', 'retry')
      ),
      updated_at = v_deactivated_at
    where campaign.id = v_campaign_id;
  end loop;

  update property_manager_profiles
  set verification_status = 'suspended', updated_at = v_deactivated_at
  where profile_id = p_profile_id;

  update profiles
  set status = 'suspended', updated_at = v_deactivated_at
  where id = p_profile_id;

  return v_deactivated_at;
end;
$$;

revoke execute on function self_deactivate_property_manager(uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function self_deactivate_property_manager(uuid, text, text, jsonb)
  to service_role;
