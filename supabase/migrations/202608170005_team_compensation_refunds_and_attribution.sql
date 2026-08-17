-- Idempotent compensation reversals for paid Wallet refunds and safe
-- attribution of events captured without an Account Manager.

create or replace function public.capture_team_refund_compensation(
  p_refund_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.team_compensation_settings%rowtype;
  v_refund public.refunds%rowtype;
  v_purchase public.lead_purchases%rowtype;
  v_original public.team_compensation_events%rowtype;
  v_existing_id uuid;
  v_event_id uuid;
  v_source_key text;
  v_profile_id uuid;
begin
  select * into v_settings
  from public.team_compensation_settings
  where id = true;

  if not found or not v_settings.feature_enabled then
    return jsonb_build_object('status', 'skipped', 'reason', 'feature_disabled');
  end if;

  select * into v_refund
  from public.refunds
  where id = p_refund_id;

  if not found then
    raise exception 'refund_not_found';
  end if;

  if v_refund.status <> 'paid' then
    return jsonb_build_object('status', 'skipped', 'reason', 'refund_not_paid');
  end if;

  select * into v_purchase
  from public.lead_purchases
  where id = v_refund.lead_purchase_id;

  if not found then
    raise exception 'lead_purchase_not_found';
  end if;

  v_source_key := 'prime_lead_purchase_refund:' || v_refund.id::text;

  select id into v_existing_id
  from public.team_compensation_events
  where source_event_key = v_source_key;

  if v_existing_id is not null then
    return jsonb_build_object(
      'status', 'already_completed',
      'compensation_event_id', v_existing_id
    );
  end if;

  select * into v_original
  from public.team_compensation_events
  where source_event_key = 'prime_lead_purchase:' || v_purchase.id::text
    and event_type = 'prime_lead_purchase'
    and status <> 'voided';

  if not found then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'original_compensation_not_found'
    );
  end if;

  select profile_id into v_profile_id
  from public.property_manager_profiles
  where id = v_purchase.property_manager_id;

  insert into public.team_compensation_events (
    member_id,
    event_type,
    status,
    source_type,
    source_id,
    source_event_key,
    lead_id,
    property_manager_profile_id,
    amount_cents,
    base_amount_cents,
    fixed_rate_cents,
    rate_basis_points,
    currency,
    description,
    metadata,
    occurred_at
  ) values (
    v_original.member_id,
    'refund_adjustment',
    case
      when v_original.member_id is null then 'pending_attribution'
      else 'accrued'
    end,
    'refund',
    v_refund.id::text,
    v_source_key,
    v_purchase.lead_id,
    coalesce(v_original.property_manager_profile_id, v_profile_id),
    -abs(v_original.amount_cents),
    coalesce(v_refund.amount_cents, v_purchase.amount_cents),
    v_original.fixed_rate_cents,
    v_original.rate_basis_points,
    'EUR',
    'Storno compenso per riaccredito Lead',
    jsonb_build_object(
      'refund_id', v_refund.id,
      'lead_purchase_id', v_purchase.id,
      'reverses_compensation_event_id', v_original.id,
      'original_amount_cents', v_original.amount_cents,
      'refund_amount_cents', coalesce(v_refund.amount_cents, v_purchase.amount_cents)
    ),
    coalesce(v_refund.reviewed_at, now())
  )
  on conflict (source_event_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select id into v_event_id
    from public.team_compensation_events
    where source_event_key = v_source_key;
  end if;

  return jsonb_build_object(
    'status', 'completed',
    'compensation_event_id', v_event_id,
    'amount_cents', -abs(v_original.amount_cents)
  );
end;
$$;

create or replace function public.reconcile_team_refund_compensations()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund_id uuid;
  v_result jsonb;
  v_checked integer := 0;
  v_completed integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
begin
  for v_refund_id in
    select refund.id
    from public.refunds refund
    where refund.status = 'paid'
      and exists (
        select 1
        from public.team_compensation_events original_event
        where original_event.source_event_key =
          'prime_lead_purchase:' || refund.lead_purchase_id::text
          and original_event.event_type = 'prime_lead_purchase'
          and original_event.status <> 'voided'
      )
      and not exists (
        select 1
        from public.team_compensation_events event
        where event.source_event_key =
          'prime_lead_purchase_refund:' || refund.id::text
      )
    order by refund.reviewed_at, refund.created_at
    limit 500
  loop
    v_checked := v_checked + 1;
    begin
      v_result := public.capture_team_refund_compensation(v_refund_id);
      if v_result ->> 'status' = 'completed' then
        v_completed := v_completed + 1;
      else
        v_skipped := v_skipped + 1;
      end if;
    exception
      when others then
        v_failed := v_failed + 1;
    end;
  end loop;

  return jsonb_build_object(
    'checked', v_checked,
    'completed', v_completed,
    'skipped', v_skipped,
    'failed', v_failed
  );
end;
$$;

create or replace function public.assign_pending_team_compensation_event(
  p_event_id uuid,
  p_member_id uuid,
  p_actor_profile_id uuid
)
returns public.team_compensation_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.team_compensation_events%rowtype;
  v_member public.team_members%rowtype;
begin
  select * into v_event
  from public.team_compensation_events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'team_compensation_event_not_found';
  end if;

  if v_event.status <> 'pending_attribution' or v_event.member_id is not null then
    raise exception 'team_compensation_event_not_pending';
  end if;

  select * into v_member
  from public.team_members
  where id = p_member_id
    and status = 'active';

  if not found then
    raise exception 'active_team_member_not_found';
  end if;

  update public.team_compensation_events
  set member_id = v_member.id,
      status = 'accrued',
      updated_at = now()
  where id = v_event.id
  returning * into v_event;

  insert into public.team_compensation_audit_logs (
    actor_profile_id,
    action,
    target_type,
    target_id,
    before_data,
    after_data,
    metadata
  ) values (
    p_actor_profile_id,
    'team_compensation.event_attributed',
    'team_compensation_event',
    v_event.id::text,
    jsonb_build_object('member_id', null, 'status', 'pending_attribution'),
    jsonb_build_object('member_id', v_member.id, 'status', 'accrued'),
    jsonb_build_object('source_event_key', v_event.source_event_key)
  );

  return v_event;
end;
$$;

revoke execute on function public.capture_team_refund_compensation(uuid)
  from public, anon, authenticated;
revoke execute on function public.reconcile_team_refund_compensations()
  from public, anon, authenticated;
revoke execute on function public.assign_pending_team_compensation_event(uuid, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.capture_team_refund_compensation(uuid)
  to service_role;
grant execute on function public.reconcile_team_refund_compensations()
  to service_role;
grant execute on function public.assign_pending_team_compensation_event(uuid, uuid, uuid)
  to service_role;
