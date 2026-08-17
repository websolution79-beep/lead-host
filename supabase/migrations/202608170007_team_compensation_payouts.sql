-- Manual and partial Team compensation payouts. No money movement is executed:
-- this ledger records payments performed outside Lead Host.

create or replace function public.get_admin_team_compensation_payouts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with member_events as (
    select
      member.id as member_id,
      profile.first_name,
      profile.last_name,
      profile.email,
      role.name as role_name,
      coalesce(sum(event.amount_cents) filter (
        where event.status = 'accrued'
      ), 0)::bigint as accrued_cents
    from public.team_members member
    join public.profiles profile on profile.id = member.profile_id
    join public.team_roles role on role.id = member.role_id
    left join public.team_compensation_events event on event.member_id = member.id
    group by member.id, profile.first_name, profile.last_name, profile.email, role.name
  ),
  member_paid as (
    select payout.member_id, coalesce(sum(payout.amount_cents), 0)::bigint as paid_cents
    from public.team_compensation_payouts payout
    where payout.status = 'completed'
    group by payout.member_id
  ),
  balances as (
    select
      events.*,
      coalesce(paid.paid_cents, 0)::bigint as paid_cents,
      greatest(events.accrued_cents - coalesce(paid.paid_cents, 0), 0)::bigint as due_cents
    from member_events events
    left join member_paid paid on paid.member_id = events.member_id
  ),
  payout_rows as (
    select
      payout.*,
      profile.first_name,
      profile.last_name,
      profile.email,
      role.name as role_name,
      recorder.first_name as recorder_first_name,
      recorder.last_name as recorder_last_name,
      recorder.email as recorder_email
    from public.team_compensation_payouts payout
    join public.team_members member on member.id = payout.member_id
    join public.profiles profile on profile.id = member.profile_id
    join public.team_roles role on role.id = member.role_id
    left join public.profiles recorder on recorder.id = payout.recorded_by
    order by payout.paid_at desc, payout.created_at desc
    limit 150
  )
  select jsonb_build_object(
    'featureEnabled', coalesce((
      select feature_enabled from public.team_compensation_settings where id = true
    ), false),
    'summary', jsonb_build_object(
      'accruedCents', coalesce((select sum(accrued_cents) from balances), 0),
      'paidCents', coalesce((select sum(paid_cents) from balances), 0),
      'dueCents', coalesce((select sum(due_cents) from balances), 0)
    ),
    'memberBalances', coalesce((
      select jsonb_agg(jsonb_build_object(
        'memberId', balance.member_id,
        'firstName', balance.first_name,
        'lastName', balance.last_name,
        'email', balance.email,
        'roleName', balance.role_name,
        'accruedCents', balance.accrued_cents,
        'paidCents', balance.paid_cents,
        'dueCents', balance.due_cents
      ) order by balance.due_cents desc, balance.last_name, balance.first_name)
      from balances balance
    ), '[]'::jsonb),
    'payouts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', payout.id,
        'memberId', payout.member_id,
        'status', payout.status,
        'amountCents', payout.amount_cents,
        'currency', payout.currency,
        'paymentMethod', payout.payment_method,
        'paymentReference', payout.payment_reference,
        'notes', payout.notes,
        'paidAt', payout.paid_at,
        'createdAt', payout.created_at,
        'voidedAt', payout.voided_at,
        'voidReason', payout.void_reason,
        'firstName', payout.first_name,
        'lastName', payout.last_name,
        'email', payout.email,
        'roleName', payout.role_name,
        'recorderFirstName', payout.recorder_first_name,
        'recorderLastName', payout.recorder_last_name,
        'recorderEmail', payout.recorder_email
      ) order by payout.paid_at desc, payout.created_at desc)
      from payout_rows payout
    ), '[]'::jsonb)
  );
$$;

create or replace function public.record_team_compensation_payout(
  p_member_id uuid,
  p_amount_cents integer,
  p_payment_method text,
  p_payment_reference text,
  p_notes text,
  p_paid_at timestamptz,
  p_actor_profile_id uuid
)
returns public.team_compensation_payouts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.team_compensation_settings%rowtype;
  v_member public.team_members%rowtype;
  v_accrued_cents bigint;
  v_paid_cents bigint;
  v_due_cents bigint;
  v_remaining integer;
  v_event record;
  v_event_paid integer;
  v_event_available integer;
  v_allocation integer;
  v_payout public.team_compensation_payouts%rowtype;
begin
  select * into v_settings
  from public.team_compensation_settings
  where id = true;

  if not found or not v_settings.feature_enabled then
    raise exception 'team_compensation_disabled';
  end if;

  if p_amount_cents <= 0 then raise exception 'invalid_payout_amount'; end if;
  if p_payment_method not in ('paypal', 'bank_transfer', 'cash', 'other') then
    raise exception 'invalid_payout_method';
  end if;
  if p_paid_at is null or p_paid_at > now() + interval '5 minutes' then
    raise exception 'invalid_payout_date';
  end if;

  select * into v_member
  from public.team_members
  where id = p_member_id;
  if not found then raise exception 'team_member_not_found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_member_id::text, 0));

  select coalesce(sum(amount_cents), 0) into v_accrued_cents
  from public.team_compensation_events
  where member_id = p_member_id and status = 'accrued';

  select coalesce(sum(amount_cents), 0) into v_paid_cents
  from public.team_compensation_payouts
  where member_id = p_member_id and status = 'completed';

  v_due_cents := greatest(v_accrued_cents - v_paid_cents, 0);
  if p_amount_cents > v_due_cents then
    raise exception 'payout_exceeds_amount_due'
      using detail = jsonb_build_object(
        'amount_cents', p_amount_cents,
        'due_cents', v_due_cents
      )::text;
  end if;

  insert into public.team_compensation_payouts (
    member_id, status, amount_cents, currency, payment_method,
    payment_reference, notes, paid_at, recorded_by
  ) values (
    p_member_id, 'completed', p_amount_cents, 'EUR', p_payment_method,
    nullif(trim(p_payment_reference), ''), nullif(trim(p_notes), ''),
    p_paid_at, p_actor_profile_id
  ) returning * into v_payout;

  v_remaining := p_amount_cents;
  for v_event in
    select event.id, event.amount_cents
    from public.team_compensation_events event
    where event.member_id = p_member_id
      and event.status = 'accrued'
      and event.amount_cents > 0
    order by event.occurred_at, event.created_at, event.id
    for update
  loop
    exit when v_remaining <= 0;

    select coalesce(sum(allocation.amount_cents), 0)::integer
    into v_event_paid
    from public.team_compensation_payout_allocations allocation
    join public.team_compensation_payouts payout on payout.id = allocation.payout_id
    where allocation.compensation_event_id = v_event.id
      and payout.status = 'completed';

    v_event_available := greatest(v_event.amount_cents - v_event_paid, 0);
    if v_event_available > 0 then
      v_allocation := least(v_event_available, v_remaining);
      insert into public.team_compensation_payout_allocations (
        payout_id, compensation_event_id, amount_cents
      ) values (v_payout.id, v_event.id, v_allocation);
      v_remaining := v_remaining - v_allocation;
    end if;
  end loop;

  if v_remaining <> 0 then raise exception 'payout_allocation_failed'; end if;

  insert into public.team_compensation_audit_logs (
    actor_profile_id, action, target_type, target_id, after_data, metadata
  ) values (
    p_actor_profile_id,
    'team_compensation.payout_recorded',
    'team_compensation_payout',
    v_payout.id::text,
    to_jsonb(v_payout),
    jsonb_build_object('member_id', p_member_id, 'amount_cents', p_amount_cents)
  );

  return v_payout;
end;
$$;

create or replace function public.void_team_compensation_payout(
  p_payout_id uuid,
  p_reason text,
  p_actor_profile_id uuid
)
returns public.team_compensation_payouts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payout public.team_compensation_payouts%rowtype;
  v_before jsonb;
begin
  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'payout_void_reason_required';
  end if;

  select * into v_payout
  from public.team_compensation_payouts
  where id = p_payout_id
  for update;
  if not found then raise exception 'team_compensation_payout_not_found'; end if;
  if v_payout.status <> 'completed' then raise exception 'payout_already_voided'; end if;

  v_before := to_jsonb(v_payout);
  update public.team_compensation_payouts
  set status = 'voided', voided_at = now(), voided_by = p_actor_profile_id,
      void_reason = trim(p_reason), updated_at = now()
  where id = p_payout_id
  returning * into v_payout;

  insert into public.team_compensation_audit_logs (
    actor_profile_id, action, target_type, target_id,
    before_data, after_data, metadata
  ) values (
    p_actor_profile_id,
    'team_compensation.payout_voided',
    'team_compensation_payout',
    v_payout.id::text,
    v_before,
    to_jsonb(v_payout),
    jsonb_build_object('reason', trim(p_reason))
  );

  return v_payout;
end;
$$;

revoke execute on function public.get_admin_team_compensation_payouts()
  from public, anon, authenticated;
revoke execute on function public.record_team_compensation_payout(
  uuid, integer, text, text, text, timestamptz, uuid
) from public, anon, authenticated;
revoke execute on function public.void_team_compensation_payout(uuid, text, uuid)
  from public, anon, authenticated;

grant execute on function public.get_admin_team_compensation_payouts()
  to service_role;
grant execute on function public.record_team_compensation_payout(
  uuid, integer, text, text, text, timestamptz, uuid
) to service_role;
grant execute on function public.void_team_compensation_payout(uuid, text, uuid)
  to service_role;

