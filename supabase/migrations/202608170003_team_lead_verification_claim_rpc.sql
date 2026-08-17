create or replace function public.claim_team_lead_verification_compensation(
  p_owner_request_id uuid,
  p_member_id uuid,
  p_actor_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.team_compensation_settings%rowtype;
  v_request public.owner_requests%rowtype;
  v_stage_name text;
  v_member_profile_id uuid;
  v_member_status text;
  v_enabled boolean;
  v_amount_cents integer;
  v_event_id uuid;
  v_existing_member_id uuid;
begin
  select *
  into v_settings
  from public.team_compensation_settings
  where id = true
  for share;

  if v_settings.id is null or not v_settings.feature_enabled then
    raise exception 'team_compensation_disabled';
  end if;

  select profile_id, status
  into v_member_profile_id, v_member_status
  from public.team_members
  where id = p_member_id;

  if v_member_profile_id is null or v_member_status <> 'active' then
    raise exception 'team_member_not_active';
  end if;

  if v_member_profile_id <> p_actor_profile_id then
    raise exception 'team_member_actor_mismatch';
  end if;

  select *
  into v_request
  from public.owner_requests
  where id = p_owner_request_id
  for update;

  if v_request.id is null then
    raise exception 'owner_request_not_found';
  end if;

  if v_request.status <> 'to_verify' then
    raise exception 'owner_request_not_new_lead';
  end if;

  select lower(trim(name))
  into v_stage_name
  from public.admin_lead_pipeline_stages
  where id = v_request.review_pipeline_stage_id;

  if v_stage_name is distinct from 'interessato' then
    raise exception 'owner_request_not_interested';
  end if;

  select
    coalesce(rule.lead_verification_enabled, true),
    coalesce(
      rule.lead_verification_cents_override,
      v_settings.lead_verification_cents
    )
  into v_enabled, v_amount_cents
  from (select 1) seed
  left join public.team_member_compensation_rules rule
    on rule.member_id = p_member_id;

  if not coalesce(v_enabled, false) then
    raise exception 'lead_verification_compensation_not_enabled';
  end if;

  if coalesce(v_amount_cents, 0) <= 0 then
    raise exception 'lead_verification_compensation_rate_zero';
  end if;

  select claim.compensation_event_id, event.member_id
  into v_event_id, v_existing_member_id
  from public.team_lead_verification_claims claim
  join public.team_compensation_events event
    on event.id = claim.compensation_event_id
  where claim.owner_request_id = p_owner_request_id
    and claim.status = 'confirmed';

  if v_event_id is not null then
    if v_existing_member_id <> p_member_id then
      raise exception 'lead_verification_already_claimed';
    end if;

    return v_event_id;
  end if;

  insert into public.team_compensation_events (
    member_id,
    event_type,
    status,
    source_type,
    source_id,
    source_event_key,
    owner_request_id,
    amount_cents,
    fixed_rate_cents,
    currency,
    description,
    metadata,
    occurred_at,
    created_by
  )
  values (
    p_member_id,
    'lead_verification',
    'accrued',
    'owner_request',
    p_owner_request_id::text,
    'lead_verification:' || p_owner_request_id::text,
    p_owner_request_id,
    v_amount_cents,
    v_amount_cents,
    'EUR',
    'Verifica Lead confermata nello stato Interessato',
    jsonb_build_object(
      'review_pipeline_stage_id', v_request.review_pipeline_stage_id,
      'rate_source', case
        when exists (
          select 1
          from public.team_member_compensation_rules rule
          where rule.member_id = p_member_id
            and rule.lead_verification_cents_override is not null
        ) then 'member_override'
        else 'global_default'
      end
    ),
    now(),
    p_actor_profile_id
  )
  returning id into v_event_id;

  insert into public.team_lead_verification_claims (
    owner_request_id,
    member_id,
    compensation_event_id,
    status,
    confirmed_at,
    confirmed_by
  )
  values (
    p_owner_request_id,
    p_member_id,
    v_event_id,
    'confirmed',
    now(),
    p_actor_profile_id
  );

  insert into public.team_compensation_audit_logs (
    actor_profile_id,
    action,
    target_type,
    target_id,
    after_data
  )
  values (
    p_actor_profile_id,
    'team_compensation.lead_verification_confirmed',
    'owner_request',
    p_owner_request_id::text,
    jsonb_build_object(
      'member_id', p_member_id,
      'compensation_event_id', v_event_id,
      'amount_cents', v_amount_cents
    )
  );

  return v_event_id;
end;
$$;

revoke all on function public.claim_team_lead_verification_compensation(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_team_lead_verification_compensation(uuid, uuid, uuid)
  to service_role;

comment on function public.claim_team_lead_verification_compensation(uuid, uuid, uuid) is
  'Conferma atomica e idempotente del compenso manuale per un Lead nello stage Interessato.';
