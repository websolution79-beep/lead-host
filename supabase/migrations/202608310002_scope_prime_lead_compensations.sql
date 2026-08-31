-- A commission for an Account Manager is earned only when a lead is bought
-- inside a PM's private Prime Zone. A public Marketplace purchase is never
-- eligible, even if the buyer has an active PRIME subscription.

create or replace function public.process_team_compensation_outbox_item(
  p_outbox_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outbox public.team_compensation_outbox%rowtype;
  v_settings public.team_compensation_settings%rowtype;
  v_member_id uuid;
  v_member_status text;
  v_rule public.team_member_compensation_rules%rowtype;
  v_enabled boolean := false;
  v_fixed_rate integer;
  v_basis_points integer;
  v_base_amount integer;
  v_amount integer;
  v_event_status text;
  v_profile_id uuid;
  v_lead_id uuid;
  v_occurred_at timestamptz;
  v_description text;
  v_event_id uuid;
  v_purchase_metadata jsonb;
begin
  select * into v_outbox
  from public.team_compensation_outbox
  where id = p_outbox_id
  for update;

  if not found then
    raise exception 'team_compensation_outbox_not_found';
  end if;

  if v_outbox.status = 'completed' then
    return jsonb_build_object('status', 'already_completed');
  end if;

  select * into v_settings
  from public.team_compensation_settings
  where id = true;

  if not found or not v_settings.feature_enabled then
    update public.team_compensation_outbox
    set status = 'completed', completed_at = now(), locked_at = null,
        last_error = 'feature_disabled', updated_at = now()
    where id = p_outbox_id;
    return jsonb_build_object('status', 'skipped', 'reason', 'feature_disabled');
  end if;

  if v_outbox.event_type not in (
    'prime_first_activation', 'prime_renewal', 'prime_lead_purchase'
  ) then
    raise exception 'unsupported_team_compensation_event';
  end if;

  -- Fail closed. The immutable Wallet transaction is written in the same
  -- atomic purchase transaction and records the visibility at purchase time.
  if v_outbox.event_type = 'prime_lead_purchase' then
    select wallet_tx.metadata into v_purchase_metadata
    from public.wallet_transactions wallet_tx
    where wallet_tx.lead_purchase_id::text = v_outbox.source_id
      and wallet_tx.type = 'lead_purchase'
      and wallet_tx.status = 'completed'
    order by wallet_tx.created_at desc
    limit 1;

    if not found
      or coalesce(v_purchase_metadata ->> 'prime_purchase', 'false') <> 'true'
      or coalesce(v_purchase_metadata ->> 'visibility_mode', '') <> 'prime_private'
    then
      update public.team_compensation_outbox
      set status = 'completed', completed_at = now(), locked_at = null,
          last_error = 'prime_zone_purchase_required', updated_at = now()
      where id = p_outbox_id;
      return jsonb_build_object(
        'status', 'skipped',
        'reason', 'prime_zone_purchase_required'
      );
    end if;
  end if;

  v_member_id := nullif(v_outbox.payload ->> 'member_id', '')::uuid;
  v_profile_id := nullif(v_outbox.payload ->> 'property_manager_profile_id', '')::uuid;
  v_lead_id := nullif(v_outbox.payload ->> 'lead_id', '')::uuid;
  v_base_amount := nullif(v_outbox.payload ->> 'base_amount_cents', '')::integer;
  v_occurred_at := coalesce(
    nullif(v_outbox.payload ->> 'occurred_at', '')::timestamptz,
    v_outbox.created_at
  );

  if v_member_id is not null then
    select status into v_member_status
    from public.team_members
    where id = v_member_id;

    if v_member_status = 'active' then
      select * into v_rule
      from public.team_member_compensation_rules
      where member_id = v_member_id;

      if v_outbox.event_type = 'prime_first_activation' then
        v_enabled := coalesce(v_rule.prime_first_activation_enabled, false);
        v_fixed_rate := coalesce(
          v_rule.prime_first_activation_cents_override,
          v_settings.prime_first_activation_cents
        );
      elsif v_outbox.event_type = 'prime_renewal' then
        v_enabled := coalesce(v_rule.prime_renewal_enabled, false);
        v_fixed_rate := coalesce(
          v_rule.prime_renewal_cents_override,
          v_settings.prime_renewal_cents
        );
      else
        v_enabled := coalesce(v_rule.prime_lead_purchase_enabled, false);
        v_basis_points := coalesce(
          v_rule.prime_lead_purchase_basis_points_override,
          v_settings.prime_lead_purchase_basis_points
        );
      end if;

      if not v_enabled then
        update public.team_compensation_outbox
        set status = 'completed', completed_at = now(), locked_at = null,
            last_error = 'member_compensation_disabled', updated_at = now()
        where id = p_outbox_id;
        return jsonb_build_object(
          'status', 'skipped', 'reason', 'member_compensation_disabled'
        );
      end if;
    else
      v_member_id := null;
    end if;
  end if;

  if v_outbox.event_type = 'prime_first_activation' then
    v_fixed_rate := coalesce(v_fixed_rate, v_settings.prime_first_activation_cents);
    v_amount := v_fixed_rate;
    v_description := 'Prima attivazione Lead Host PRIME';
  elsif v_outbox.event_type = 'prime_renewal' then
    v_fixed_rate := coalesce(v_fixed_rate, v_settings.prime_renewal_cents);
    v_amount := v_fixed_rate;
    v_description := 'Rinnovo mensile Lead Host PRIME';
  else
    if v_base_amount is null or v_base_amount <= 0 then
      raise exception 'invalid_prime_lead_purchase_amount';
    end if;
    v_basis_points := coalesce(
      v_basis_points,
      v_settings.prime_lead_purchase_basis_points
    );
    v_amount := round(v_base_amount::numeric * v_basis_points / 10000)::integer;
    v_description := 'Acquisto Lead da cliente PRIME';
  end if;

  if v_amount <= 0 then
    update public.team_compensation_outbox
    set status = 'completed', completed_at = now(), locked_at = null,
        last_error = 'zero_compensation', updated_at = now()
    where id = p_outbox_id;
    return jsonb_build_object('status', 'skipped', 'reason', 'zero_compensation');
  end if;

  v_event_status := case
    when v_member_id is null then 'pending_attribution'
    else 'accrued'
  end;

  insert into public.team_compensation_events (
    member_id, event_type, status, source_type, source_id, source_event_key,
    lead_id, property_manager_profile_id, amount_cents, base_amount_cents,
    fixed_rate_cents, rate_basis_points, currency, description, metadata, occurred_at
  ) values (
    v_member_id, v_outbox.event_type, v_event_status, v_outbox.source_type,
    v_outbox.source_id, v_outbox.source_event_key, v_lead_id, v_profile_id,
    v_amount,
    case when v_outbox.event_type = 'prime_lead_purchase' then v_base_amount else null end,
    case when v_outbox.event_type <> 'prime_lead_purchase' then v_fixed_rate else null end,
    case when v_outbox.event_type = 'prime_lead_purchase' then v_basis_points else null end,
    'EUR', v_description, v_outbox.payload, v_occurred_at
  )
  on conflict (source_event_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select id into v_event_id
    from public.team_compensation_events
    where source_event_key = v_outbox.source_event_key;
  end if;

  update public.team_compensation_outbox
  set status = 'completed', completed_at = now(), locked_at = null,
      last_error = null, updated_at = now()
  where id = p_outbox_id;

  return jsonb_build_object(
    'status', 'completed', 'compensation_event_id', v_event_id,
    'compensation_status', v_event_status, 'amount_cents', v_amount
  );
exception
  when others then
    update public.team_compensation_outbox
    set status = 'failed',
        available_at = now() + make_interval(
          secs => least(21600, 30 * power(2, greatest(0, attempts - 1)))::integer
        ),
        locked_at = null,
        last_error = left(sqlerrm, 2000),
        updated_at = now()
    where id = p_outbox_id;
    return jsonb_build_object('status', 'failed', 'error', left(sqlerrm, 2000));
end;
$$;

-- Correct historical public-Marketplace commissions that have not been paid.
-- The original event is retained as voided for auditability; no payout data is
-- deleted or changed.
with invalid_events as (
  select event.id
  from public.team_compensation_events event
  join public.wallet_transactions wallet_tx
    on wallet_tx.lead_purchase_id::text = event.source_id
   and wallet_tx.type = 'lead_purchase'
   and wallet_tx.status = 'completed'
  left join public.team_compensation_payout_allocations allocation
    on allocation.compensation_event_id = event.id
  where event.event_type = 'prime_lead_purchase'
    and event.status = 'accrued'
    and allocation.id is null
    and (
      coalesce(wallet_tx.metadata ->> 'prime_purchase', 'false') <> 'true'
      or coalesce(wallet_tx.metadata ->> 'visibility_mode', '') <> 'prime_private'
    )
), voided_events as (
  update public.team_compensation_events event
  set
    status = 'voided',
    voided_at = now(),
    voided_by = null,
    void_reason = 'Compenso non dovuto: acquisto effettuato nel Marketplace pubblico.',
    updated_at = now()
  from invalid_events invalid
  where event.id = invalid.id
  returning event.id, event.source_event_key, event.amount_cents
)
insert into public.team_compensation_audit_logs (
  actor_profile_id, action, target_type, target_id, before_data, after_data, metadata
)
select
  null,
  'team_compensation.public_marketplace_purchase_voided',
  'team_compensation_event',
  event.id::text,
  jsonb_build_object('status', 'accrued', 'amount_cents', event.amount_cents),
  jsonb_build_object('status', 'voided', 'amount_cents', event.amount_cents),
  jsonb_build_object(
    'source_event_key', event.source_event_key,
    'reason', 'public_marketplace_purchase'
  )
from voided_events event;

update public.team_compensation_outbox outbox
set
  status = 'completed',
  completed_at = coalesce(outbox.completed_at, now()),
  locked_at = null,
  last_error = 'prime_zone_purchase_required',
  updated_at = now()
from public.wallet_transactions wallet_tx
where outbox.event_type = 'prime_lead_purchase'
  and outbox.status in ('pending', 'failed')
  and wallet_tx.lead_purchase_id::text = outbox.source_id
  and wallet_tx.type = 'lead_purchase'
  and wallet_tx.status = 'completed'
  and (
    coalesce(wallet_tx.metadata ->> 'prime_purchase', 'false') <> 'true'
    or coalesce(wallet_tx.metadata ->> 'visibility_mode', '') <> 'prime_private'
  );

revoke execute on function public.process_team_compensation_outbox_item(uuid)
  from public, anon, authenticated;
grant execute on function public.process_team_compensation_outbox_item(uuid)
  to service_role;
