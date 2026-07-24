create table if not exists terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete restrict,
  context text not null
    check (context in ('wallet_top_up', 'lead_purchase')),
  terms_version text not null,
  wallet_transaction_id uuid references wallet_transactions(id) on delete restrict,
  lead_purchase_id uuid references lead_purchases(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  accepted_at timestamptz not null default now(),
  constraint terms_acceptance_context_reference check (
    (context = 'wallet_top_up' and wallet_transaction_id is not null and lead_purchase_id is null)
    or
    (context = 'lead_purchase' and lead_purchase_id is not null and wallet_transaction_id is null)
  )
);

create unique index if not exists terms_acceptances_wallet_transaction_unique
  on terms_acceptances (wallet_transaction_id)
  where wallet_transaction_id is not null;

create unique index if not exists terms_acceptances_lead_purchase_unique
  on terms_acceptances (lead_purchase_id)
  where lead_purchase_id is not null;

create index if not exists terms_acceptances_profile_date_idx
  on terms_acceptances (profile_id, accepted_at desc);

alter table terms_acceptances enable row level security;

drop policy if exists "terms_acceptances_select_own_or_admin" on terms_acceptances;
create policy "terms_acceptances_select_own_or_admin"
on terms_acceptances for select
to authenticated
using (profile_id = current_profile_id() or is_super_admin());

revoke insert, update, delete on terms_acceptances from anon, authenticated;
grant select on terms_acceptances to authenticated;
grant all on terms_acceptances to service_role;

create table if not exists public_form_rate_limits (
  fingerprint_hash text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count > 0),
  updated_at timestamptz not null default now()
);

alter table public_form_rate_limits enable row level security;
revoke all on public_form_rate_limits from public, anon, authenticated;
grant all on public_form_rate_limits to service_role;

create or replace function consume_public_form_rate_limit(
  p_fingerprint_hash text,
  p_limit integer default 8,
  p_window_seconds integer default 900
)
returns table (
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public_form_rate_limits;
  v_window interval;
begin
  if
    nullif(trim(p_fingerprint_hash), '') is null
    or p_limit < 1
    or p_window_seconds < 1
  then
    raise exception 'invalid_rate_limit_parameters';
  end if;

  v_window := make_interval(secs => p_window_seconds);

  insert into public_form_rate_limits (
    fingerprint_hash,
    window_started_at,
    request_count,
    updated_at
  )
  values (
    p_fingerprint_hash,
    v_now,
    1,
    v_now
  )
  on conflict (fingerprint_hash) do update
  set
    window_started_at = case
      when public_form_rate_limits.window_started_at + v_window <= v_now
        then v_now
      else public_form_rate_limits.window_started_at
    end,
    request_count = case
      when public_form_rate_limits.window_started_at + v_window <= v_now
        then 1
      else public_form_rate_limits.request_count + 1
    end,
    updated_at = v_now
  returning * into v_row;

  delete from public_form_rate_limits
  where updated_at < v_now - interval '2 days';

  allowed := v_row.request_count <= p_limit;
  retry_after_seconds := case
    when allowed then 0
    else greatest(
      ceil(extract(epoch from (v_row.window_started_at + v_window - v_now)))::integer,
      1
    )
  end;
  return next;
end;
$$;

revoke execute on function consume_public_form_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function consume_public_form_rate_limit(text, integer, integer)
  to service_role;

drop function if exists purchase_lead_with_wallet(
  uuid,
  uuid,
  uuid,
  purchase_mode
);

create or replace function purchase_lead_with_wallet(
  p_profile_id uuid,
  p_property_manager_id uuid,
  p_lead_id uuid,
  p_mode purchase_mode,
  p_expected_amount_cents integer,
  p_terms_version text
)
returns table (
  lead_id uuid,
  lead_title text,
  purchase_id uuid,
  mode purchase_mode,
  amount_cents integer,
  balance_cents integer,
  shared_slots_available integer,
  internal_status lead_internal_status,
  public_status lead_public_status
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead leads;
  v_wallet wallets;
  v_purchase lead_purchases;
  v_amount_cents integer;
  v_new_balance_cents integer;
  v_shared_slots_sold integer;
begin
  if p_expected_amount_cents <= 0 then
    raise exception 'invalid_expected_amount';
  end if;

  if nullif(trim(p_terms_version), '') is null then
    raise exception 'terms_acceptance_required';
  end if;

  if not exists (
    select 1
    from property_manager_profiles pm
    join profiles p on p.id = pm.profile_id
    join user_roles ur on ur.profile_id = p.id
    where pm.id = p_property_manager_id
      and pm.profile_id = p_profile_id
      and pm.verification_status <> 'suspended'
      and p.status = 'active'
      and ur.role = 'property_manager'
  ) then
    raise exception 'property_manager_not_authorized';
  end if;

  insert into wallets (profile_id)
  values (p_profile_id)
  on conflict (profile_id) do nothing;

  select *
  into v_wallet
  from wallets
  where wallets.profile_id = p_profile_id
  for update;

  if not found then
    raise exception 'wallet_not_found';
  end if;

  select *
  into v_lead
  from leads
  where leads.id = p_lead_id
  for update;

  if not found or v_lead.published_at is null then
    raise exception 'lead_not_found';
  end if;

  if coalesce(v_lead.expires_at, v_lead.visible_until, v_lead.created_at) <= now() then
    raise exception 'lead_unavailable';
  end if;

  if exists (
    select 1
    from lead_purchases lp
    where lp.lead_id = p_lead_id
      and lp.property_manager_id = p_property_manager_id
      and lp.status in ('paid', 'contact_unlocked')
  ) then
    raise exception 'already_purchased';
  end if;

  if p_mode = 'exclusive' then
    if
      v_lead.internal_status <> 'available'
      or v_lead.shared_slots_sold <> 0
      or v_lead.exclusive_purchase_id is not null
    then
      raise exception 'exclusive_not_available';
    end if;

    v_amount_cents := v_lead.exclusive_price_cents;
  else
    if
      v_lead.exclusive_purchase_id is not null
      or v_lead.shared_slots_sold >= 2
      or v_lead.internal_status in (
        'sold_two_pm',
        'sold_exclusive',
        'withdrawn_after_7_days',
        'cancelled',
        'refunded'
      )
    then
      raise exception 'shared_slot_not_available';
    end if;

    v_amount_cents := v_lead.shared_price_cents;
  end if;

  if v_amount_cents <> p_expected_amount_cents then
    raise exception 'price_changed'
      using detail = json_build_object(
        'expected_amount_cents', p_expected_amount_cents,
        'current_amount_cents', v_amount_cents
      )::text;
  end if;

  if v_wallet.balance_cents < v_amount_cents then
    raise exception 'insufficient_credit'
      using detail = json_build_object(
        'balance_cents', v_wallet.balance_cents,
        'required_amount_cents', v_amount_cents,
        'missing_amount_cents', v_amount_cents - v_wallet.balance_cents
      )::text;
  end if;

  insert into lead_purchases (
    lead_id,
    property_manager_id,
    purchase_attempt_id,
    mode,
    amount_cents,
    status,
    unlocked_at
  ) values (
    p_lead_id,
    p_property_manager_id,
    null,
    p_mode,
    v_amount_cents,
    'contact_unlocked',
    now()
  )
  returning * into v_purchase;

  if p_mode = 'exclusive' then
    update leads
    set
      shared_slots_sold = 0,
      exclusive_purchase_id = v_purchase.id,
      internal_status = 'sold_exclusive',
      public_status = 'unavailable'
    where leads.id = p_lead_id
    returning * into v_lead;
  else
    v_shared_slots_sold := v_lead.shared_slots_sold + 1;

    update leads
    set
      shared_slots_sold = v_shared_slots_sold,
      exclusive_purchase_id = null,
      internal_status = case
        when v_shared_slots_sold >= 2 then 'sold_two_pm'::lead_internal_status
        else 'one_slot_sold'::lead_internal_status
      end,
      public_status = case
        when v_shared_slots_sold >= 2 then 'unavailable'::lead_public_status
        else 'last_availability'::lead_public_status
      end
    where leads.id = p_lead_id
    returning * into v_lead;
  end if;

  v_new_balance_cents := v_wallet.balance_cents - v_amount_cents;

  update wallets
  set balance_cents = v_new_balance_cents
  where wallets.id = v_wallet.id;

  insert into wallet_transactions (
    wallet_id,
    profile_id,
    type,
    status,
    amount_cents,
    balance_after_cents,
    description,
    provider,
    provider_reference,
    lead_purchase_id,
    metadata,
    completed_at
  ) values (
    v_wallet.id,
    p_profile_id,
    'lead_purchase',
    'completed',
    -v_amount_cents,
    v_new_balance_cents,
    'Acquisto lead: ' || v_lead.title,
    'wallet',
    v_purchase.id::text,
    v_purchase.id,
    jsonb_build_object(
      'lead_id', p_lead_id,
      'purchase_mode', p_mode
    ),
    now()
  );

  insert into terms_acceptances (
    profile_id,
    context,
    terms_version,
    lead_purchase_id,
    metadata
  ) values (
    p_profile_id,
    'lead_purchase',
    p_terms_version,
    v_purchase.id,
    jsonb_build_object(
      'lead_id', p_lead_id,
      'purchase_mode', p_mode,
      'amount_cents', v_amount_cents
    )
  );

  return query select
    v_lead.id,
    v_lead.title,
    v_purchase.id,
    v_purchase.mode,
    v_amount_cents,
    v_new_balance_cents,
    case
      when v_lead.exclusive_purchase_id is not null then 0
      when v_lead.internal_status in (
        'sold_exclusive',
        'sold_two_pm',
        'withdrawn_after_7_days',
        'cancelled',
        'refunded'
      ) then 0
      else greatest(2 - v_lead.shared_slots_sold, 0)
    end,
    v_lead.internal_status,
    v_lead.public_status;
end;
$$;

revoke execute on function purchase_lead_with_wallet(
  uuid,
  uuid,
  uuid,
  purchase_mode,
  integer,
  text
) from public, anon, authenticated;
grant execute on function purchase_lead_with_wallet(
  uuid,
  uuid,
  uuid,
  purchase_mode,
  integer,
  text
) to service_role;

update refunds r
set amount_cents = lp.amount_cents
from lead_purchases lp
where r.lead_purchase_id = lp.id
  and r.status in ('pending', 'approved')
  and r.amount_cents is distinct from lp.amount_cents;

create or replace function pay_wallet_refund(
  p_refund_id uuid,
  p_reviewer_profile_id uuid
)
returns table (
  refund_id uuid,
  wallet_transaction_id uuid,
  balance_cents integer,
  amount_cents integer,
  status refund_status
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund refunds;
  v_purchase lead_purchases;
  v_property_manager property_manager_profiles;
  v_wallet wallets;
  v_wallet_transaction wallet_transactions;
  v_amount_cents integer;
  v_new_balance_cents integer;
begin
  if not exists (
    select 1
    from user_roles
    where profile_id = p_reviewer_profile_id
      and role = 'super_admin'
  ) then
    raise exception 'reviewer_not_authorized';
  end if;

  select *
  into v_refund
  from refunds
  where refunds.id = p_refund_id
  for update;

  if not found then
    raise exception 'refund_not_found';
  end if;

  if v_refund.status = 'paid' then
    select wt.*
    into v_wallet_transaction
    from wallet_transactions wt
    where wt.type = 'refund'
      and wt.metadata->>'refund_id' = v_refund.id::text
    order by wt.created_at desc
    limit 1;

    select *
    into v_wallet
    from wallets
    where wallets.profile_id = (
      select pm.profile_id
      from property_manager_profiles pm
      where pm.id = v_refund.requested_by_property_manager_id
    );

    refund_id := v_refund.id;
    wallet_transaction_id := v_wallet_transaction.id;
    balance_cents := coalesce(v_wallet.balance_cents, 0);
    amount_cents := coalesce(v_refund.amount_cents, 0);
    status := v_refund.status;
    return next;
    return;
  end if;

  if v_refund.status not in ('pending', 'approved') then
    raise exception 'refund_not_payable';
  end if;

  select *
  into v_purchase
  from lead_purchases
  where lead_purchases.id = v_refund.lead_purchase_id
  for update;

  if not found then
    raise exception 'lead_purchase_not_found';
  end if;

  if v_purchase.status = 'refunded' then
    raise exception 'lead_purchase_already_refunded';
  end if;

  if v_refund.requested_by_property_manager_id <> v_purchase.property_manager_id then
    raise exception 'refund_purchase_owner_mismatch';
  end if;

  select *
  into v_property_manager
  from property_manager_profiles
  where property_manager_profiles.id = v_purchase.property_manager_id;

  if not found then
    raise exception 'property_manager_not_found';
  end if;

  v_amount_cents := v_purchase.amount_cents;

  if v_amount_cents <= 0 then
    raise exception 'invalid_purchase_amount';
  end if;

  insert into wallets (profile_id)
  values (v_property_manager.profile_id)
  on conflict (profile_id) do nothing;

  select *
  into v_wallet
  from wallets
  where wallets.profile_id = v_property_manager.profile_id
  for update;

  if not found then
    raise exception 'wallet_not_found';
  end if;

  v_new_balance_cents := v_wallet.balance_cents + v_amount_cents;

  update wallets
  set balance_cents = v_new_balance_cents
  where wallets.id = v_wallet.id;

  update lead_purchases
  set status = 'refunded'
  where lead_purchases.id = v_purchase.id;

  update refunds
  set
    amount_cents = v_amount_cents,
    status = 'paid',
    reviewed_by = p_reviewer_profile_id,
    reviewed_at = now()
  where refunds.id = v_refund.id
  returning * into v_refund;

  insert into wallet_transactions (
    wallet_id,
    profile_id,
    type,
    status,
    amount_cents,
    balance_after_cents,
    description,
    provider,
    provider_reference,
    lead_purchase_id,
    metadata,
    completed_at
  ) values (
    v_wallet.id,
    v_property_manager.profile_id,
    'refund',
    'completed',
    v_amount_cents,
    v_new_balance_cents,
    'Riaccredito Wallet lead',
    'wallet',
    v_refund.id::text,
    v_purchase.id,
    jsonb_build_object(
      'refund_id', v_refund.id,
      'lead_id', v_purchase.lead_id,
      'reviewed_by', p_reviewer_profile_id,
      'refund_scope', 'full_purchase_amount'
    ),
    now()
  )
  returning * into v_wallet_transaction;

  insert into audit_logs (
    actor_profile_id,
    actor_role,
    entity_type,
    entity_id,
    action,
    before,
    after
  ) values (
    p_reviewer_profile_id,
    'super_admin',
    'refund',
    v_refund.id,
    'refund.wallet_recredited',
    jsonb_build_object(
      'lead_purchase_id', v_purchase.id,
      'purchase_status', v_purchase.status
    ),
    jsonb_build_object(
      'amount_cents', v_amount_cents,
      'wallet_transaction_id', v_wallet_transaction.id,
      'balance_cents', v_new_balance_cents
    )
  );

  refund_id := v_refund.id;
  wallet_transaction_id := v_wallet_transaction.id;
  balance_cents := v_new_balance_cents;
  amount_cents := v_amount_cents;
  status := v_refund.status;
  return next;
end;
$$;

revoke execute on function pay_wallet_refund(uuid, uuid)
  from public, anon, authenticated;
grant execute on function pay_wallet_refund(uuid, uuid)
  to service_role;

drop policy if exists "pm_profiles_upsert_own_or_admin"
  on property_manager_profiles;

revoke insert, update, delete on property_manager_profiles
  from authenticated;
grant select on property_manager_profiles to authenticated;

revoke insert, delete on profiles from authenticated;
revoke update on profiles from authenticated;
grant update (first_name, last_name, phone, avatar_url)
  on profiles to authenticated;

revoke execute on function ensure_wallet(uuid)
  from public, anon, authenticated;
grant execute on function ensure_wallet(uuid)
  to service_role;

revoke execute on function publish_lead(uuid)
  from public, anon, authenticated;
grant execute on function publish_lead(uuid)
  to service_role;

revoke execute on function claim_paid_lead_purchase(uuid, text, text)
  from public, anon, authenticated;
grant execute on function claim_paid_lead_purchase(uuid, text, text)
  to service_role;

revoke execute on function complete_wallet_top_up(
  uuid,
  text,
  text,
  integer,
  text,
  jsonb
) from public, anon, authenticated;
grant execute on function complete_wallet_top_up(
  uuid,
  text,
  text,
  integer,
  text,
  jsonb
) to service_role;

revoke execute on function fail_wallet_top_up(
  uuid,
  text,
  wallet_transaction_status,
  jsonb
) from public, anon, authenticated;
grant execute on function fail_wallet_top_up(
  uuid,
  text,
  wallet_transaction_status,
  jsonb
) to service_role;

revoke execute on function expire_leads(timestamptz)
  from public, anon, authenticated;
grant execute on function expire_leads(timestamptz)
  to service_role;
