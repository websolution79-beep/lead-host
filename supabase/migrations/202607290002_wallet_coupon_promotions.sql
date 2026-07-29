-- Wallet coupon promotions.
-- Stripe payments and invoices continue to use only the paid top-up amount.

insert into settings (key, value)
values ('wallet.coupons_enabled', 'false'::jsonb)
on conflict (key) do nothing;

create table if not exists wallet_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  partner_name text,
  active boolean not null default false,
  first_top_up_only boolean not null default true,
  valid_from timestamptz,
  valid_until timestamptz,
  max_total_redemptions integer,
  max_redemptions_per_profile integer not null default 1,
  bonus_budget_cents integer,
  created_by uuid references profiles(id) on delete set null,
  updated_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallet_coupons_code_format
    check (code = upper(btrim(code)) and code ~ '^[A-Z0-9_-]{3,40}$'),
  constraint wallet_coupons_validity
    check (valid_until is null or valid_from is null or valid_until > valid_from),
  constraint wallet_coupons_max_total
    check (max_total_redemptions is null or max_total_redemptions > 0),
  constraint wallet_coupons_max_per_profile
    check (max_redemptions_per_profile > 0),
  constraint wallet_coupons_budget
    check (bonus_budget_cents is null or bonus_budget_cents > 0)
);

create unique index if not exists wallet_coupons_code_unique
  on wallet_coupons (upper(code));

drop trigger if exists wallet_coupons_updated_at on wallet_coupons;
create trigger wallet_coupons_updated_at
before update on wallet_coupons
for each row execute function set_updated_at();

create table if not exists wallet_coupon_bonus_tiers (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references wallet_coupons(id) on delete cascade,
  min_paid_cents integer not null,
  max_paid_cents integer,
  bonus_cents integer not null,
  created_at timestamptz not null default now(),
  constraint wallet_coupon_tiers_min_positive check (min_paid_cents > 0),
  constraint wallet_coupon_tiers_max_valid
    check (max_paid_cents is null or max_paid_cents >= min_paid_cents),
  constraint wallet_coupon_tiers_bonus_positive check (bonus_cents > 0),
  constraint wallet_coupon_tiers_unique_min unique (coupon_id, min_paid_cents)
);

create index if not exists wallet_coupon_tiers_coupon_idx
  on wallet_coupon_bonus_tiers (coupon_id, min_paid_cents desc);

create table if not exists wallet_coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references wallet_coupons(id) on delete restrict,
  profile_id uuid not null references profiles(id) on delete restrict,
  wallet_transaction_id uuid not null unique
    references wallet_transactions(id) on delete restrict,
  status text not null default 'pending',
  code_snapshot text not null,
  paid_amount_cents integer not null,
  bonus_amount_cents integer not null,
  first_top_up_only boolean not null default true,
  rules_snapshot jsonb not null default '{}'::jsonb,
  provider_checkout_session_id text,
  reserved_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  bonus_wallet_transaction_id uuid unique
    references wallet_transactions(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallet_coupon_redemptions_status
    check (status in ('pending', 'redeemed', 'cancelled', 'expired')),
  constraint wallet_coupon_redemptions_amounts
    check (paid_amount_cents > 0 and bonus_amount_cents > 0),
  constraint wallet_coupon_redemptions_expiry
    check (expires_at > reserved_at)
);

drop trigger if exists wallet_coupon_redemptions_updated_at
  on wallet_coupon_redemptions;
create trigger wallet_coupon_redemptions_updated_at
before update on wallet_coupon_redemptions
for each row execute function set_updated_at();

create unique index if not exists wallet_coupon_redemptions_pending_profile_unique
  on wallet_coupon_redemptions (profile_id)
  where status = 'pending';

create index if not exists wallet_coupon_redemptions_coupon_status_idx
  on wallet_coupon_redemptions (coupon_id, status, created_at desc);

create index if not exists wallet_coupon_redemptions_profile_status_idx
  on wallet_coupon_redemptions (profile_id, status, created_at desc);

alter table wallet_coupons enable row level security;
alter table wallet_coupon_bonus_tiers enable row level security;
alter table wallet_coupon_redemptions enable row level security;

create or replace function preview_wallet_top_up_coupon(
  p_profile_id uuid,
  p_code text,
  p_paid_amount_cents integer
)
returns table (
  coupon_id uuid,
  code text,
  coupon_name text,
  paid_amount_cents integer,
  bonus_amount_cents integer,
  wallet_credit_cents integer,
  first_top_up_only boolean,
  valid_until timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon wallet_coupons;
  v_tier wallet_coupon_bonus_tiers;
  v_feature_enabled boolean;
  v_profile_redemptions integer;
  v_total_redemptions integer;
  v_bonus_spent_cents bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  if p_profile_id is null or p_paid_amount_cents <= 0 then
    raise exception 'coupon_invalid_request';
  end if;

  select coalesce((s.value #>> '{}')::boolean, false)
  into v_feature_enabled
  from settings s
  where s.key = 'wallet.coupons_enabled';

  if not coalesce(v_feature_enabled, false) then
    raise exception 'coupons_disabled';
  end if;

  select *
  into v_coupon
  from wallet_coupons wc
  where wc.code = upper(btrim(p_code))
  limit 1;

  if not found or not v_coupon.active then
    raise exception 'coupon_not_found';
  end if;

  if v_coupon.valid_from is not null and now() < v_coupon.valid_from then
    raise exception 'coupon_not_started';
  end if;

  if v_coupon.valid_until is not null and now() >= v_coupon.valid_until then
    raise exception 'coupon_expired';
  end if;

  if v_coupon.first_top_up_only and exists (
    select 1
    from wallet_transactions wt
    where wt.profile_id = p_profile_id
      and wt.type = 'top_up'
      and wt.status = 'completed'
  ) then
    raise exception 'coupon_first_top_up_only';
  end if;

  select count(*)::integer
  into v_profile_redemptions
  from wallet_coupon_redemptions wcr
  where wcr.coupon_id = v_coupon.id
    and wcr.profile_id = p_profile_id
    and wcr.status = 'redeemed';

  if v_profile_redemptions >= v_coupon.max_redemptions_per_profile then
    raise exception 'coupon_profile_limit_reached';
  end if;

  select count(*)::integer, coalesce(sum(wcr.bonus_amount_cents), 0)
  into v_total_redemptions, v_bonus_spent_cents
  from wallet_coupon_redemptions wcr
  where wcr.coupon_id = v_coupon.id
    and wcr.status = 'redeemed';

  if v_coupon.max_total_redemptions is not null
    and v_total_redemptions >= v_coupon.max_total_redemptions then
    raise exception 'coupon_total_limit_reached';
  end if;

  select *
  into v_tier
  from wallet_coupon_bonus_tiers wcbt
  where wcbt.coupon_id = v_coupon.id
    and wcbt.min_paid_cents <= p_paid_amount_cents
    and (
      wcbt.max_paid_cents is null
      or p_paid_amount_cents <= wcbt.max_paid_cents
    )
  order by wcbt.min_paid_cents desc
  limit 1;

  if not found then
    raise exception 'coupon_amount_not_eligible';
  end if;

  if v_coupon.bonus_budget_cents is not null
    and v_bonus_spent_cents + v_tier.bonus_cents
      > v_coupon.bonus_budget_cents then
    raise exception 'coupon_budget_exhausted';
  end if;

  return query select
    v_coupon.id,
    v_coupon.code,
    v_coupon.name,
    p_paid_amount_cents,
    v_tier.bonus_cents,
    p_paid_amount_cents + v_tier.bonus_cents,
    v_coupon.first_top_up_only,
    v_coupon.valid_until;
end;
$$;

create or replace function reserve_wallet_top_up_coupon(
  p_profile_id uuid,
  p_wallet_transaction_id uuid,
  p_code text,
  p_paid_amount_cents integer,
  p_expires_at timestamptz
)
returns table (
  redemption_id uuid,
  coupon_id uuid,
  code text,
  coupon_name text,
  paid_amount_cents integer,
  bonus_amount_cents integer,
  wallet_credit_cents integer,
  expires_at timestamptz,
  first_top_up_only boolean,
  valid_until timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon wallet_coupons;
  v_tier wallet_coupon_bonus_tiers;
  v_redemption wallet_coupon_redemptions;
  v_transaction wallet_transactions;
  v_feature_enabled boolean;
  v_profile_redemptions integer;
  v_total_redemptions integer;
  v_bonus_reserved_cents bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  if p_profile_id is null
    or p_wallet_transaction_id is null
    or p_paid_amount_cents <= 0
    or p_expires_at <= now() then
    raise exception 'coupon_invalid_request';
  end if;

  update wallet_coupon_redemptions
  set
    status = 'expired',
    cancelled_at = now(),
    cancellation_reason = 'reservation_expired'
  where wallet_coupon_redemptions.status = 'pending'
    and wallet_coupon_redemptions.expires_at <= now();

  select coalesce((s.value #>> '{}')::boolean, false)
  into v_feature_enabled
  from settings s
  where s.key = 'wallet.coupons_enabled';

  if not coalesce(v_feature_enabled, false) then
    raise exception 'coupons_disabled';
  end if;

  select *
  into v_transaction
  from wallet_transactions wt
  where wt.id = p_wallet_transaction_id
  for update;

  if not found
    or v_transaction.profile_id <> p_profile_id
    or v_transaction.type <> 'top_up'
    or v_transaction.status <> 'pending'
    or v_transaction.amount_cents <> p_paid_amount_cents then
    raise exception 'coupon_wallet_transaction_invalid';
  end if;

  select *
  into v_coupon
  from wallet_coupons wc
  where wc.code = upper(btrim(p_code))
  for update;

  if not found or not v_coupon.active then
    raise exception 'coupon_not_found';
  end if;

  if v_coupon.valid_from is not null and now() < v_coupon.valid_from then
    raise exception 'coupon_not_started';
  end if;

  if v_coupon.valid_until is not null and now() >= v_coupon.valid_until then
    raise exception 'coupon_expired';
  end if;

  if v_coupon.first_top_up_only and exists (
    select 1
    from wallet_transactions wt
    where wt.profile_id = p_profile_id
      and wt.type = 'top_up'
      and wt.status = 'completed'
  ) then
    raise exception 'coupon_first_top_up_only';
  end if;

  select count(*)::integer
  into v_profile_redemptions
  from wallet_coupon_redemptions wcr
  where wcr.coupon_id = v_coupon.id
    and wcr.profile_id = p_profile_id
    and wcr.status in ('pending', 'redeemed');

  if v_profile_redemptions >= v_coupon.max_redemptions_per_profile then
    raise exception 'coupon_profile_limit_reached';
  end if;

  select count(*)::integer, coalesce(sum(wcr.bonus_amount_cents), 0)
  into v_total_redemptions, v_bonus_reserved_cents
  from wallet_coupon_redemptions wcr
  where wcr.coupon_id = v_coupon.id
    and wcr.status in ('pending', 'redeemed');

  if v_coupon.max_total_redemptions is not null
    and v_total_redemptions >= v_coupon.max_total_redemptions then
    raise exception 'coupon_total_limit_reached';
  end if;

  select *
  into v_tier
  from wallet_coupon_bonus_tiers wcbt
  where wcbt.coupon_id = v_coupon.id
    and wcbt.min_paid_cents <= p_paid_amount_cents
    and (
      wcbt.max_paid_cents is null
      or p_paid_amount_cents <= wcbt.max_paid_cents
    )
  order by wcbt.min_paid_cents desc
  limit 1;

  if not found then
    raise exception 'coupon_amount_not_eligible';
  end if;

  if v_coupon.bonus_budget_cents is not null
    and v_bonus_reserved_cents + v_tier.bonus_cents
      > v_coupon.bonus_budget_cents then
    raise exception 'coupon_budget_exhausted';
  end if;

  insert into wallet_coupon_redemptions (
    coupon_id,
    profile_id,
    wallet_transaction_id,
    code_snapshot,
    paid_amount_cents,
    bonus_amount_cents,
    first_top_up_only,
    rules_snapshot,
    expires_at
  ) values (
    v_coupon.id,
    p_profile_id,
    p_wallet_transaction_id,
    v_coupon.code,
    p_paid_amount_cents,
    v_tier.bonus_cents,
    v_coupon.first_top_up_only,
    jsonb_build_object(
      'coupon_name', v_coupon.name,
      'partner_name', v_coupon.partner_name,
      'tier_min_paid_cents', v_tier.min_paid_cents,
      'tier_max_paid_cents', v_tier.max_paid_cents,
      'bonus_cents', v_tier.bonus_cents,
      'valid_from', v_coupon.valid_from,
      'valid_until', v_coupon.valid_until
    ),
    p_expires_at
  )
  returning * into v_redemption;

  return query select
    v_redemption.id,
    v_coupon.id,
    v_coupon.code,
    v_coupon.name,
    p_paid_amount_cents,
    v_tier.bonus_cents,
    p_paid_amount_cents + v_tier.bonus_cents,
    v_redemption.expires_at,
    v_coupon.first_top_up_only,
    v_coupon.valid_until;
end;
$$;

create or replace function cancel_wallet_top_up_coupon_reservation(
  p_wallet_transaction_id uuid,
  p_reason text
)
returns wallet_coupon_redemptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_redemption wallet_coupon_redemptions;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  update wallet_coupon_redemptions
  set
    status = 'cancelled',
    cancelled_at = now(),
    cancellation_reason = left(coalesce(nullif(btrim(p_reason), ''), 'cancelled'), 120)
  where wallet_transaction_id = p_wallet_transaction_id
    and status = 'pending'
  returning * into v_redemption;

  return v_redemption;
end;
$$;

drop function if exists complete_wallet_top_up(
  uuid, text, text, integer, text, jsonb
);

create function complete_wallet_top_up(
  p_wallet_transaction_id uuid,
  p_provider_payment_id text,
  p_provider_checkout_session_id text,
  p_amount_cents integer,
  p_currency text,
  p_raw_event jsonb
)
returns table (
  wallet_id uuid,
  profile_id uuid,
  wallet_transaction_id uuid,
  amount_cents integer,
  bonus_amount_cents integer,
  balance_cents integer,
  payment_id uuid,
  coupon_code text,
  bonus_wallet_transaction_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction wallet_transactions;
  v_bonus_transaction wallet_transactions;
  v_wallet wallets;
  v_payment payments;
  v_redemption wallet_coupon_redemptions;
  v_new_balance_cents integer;
  v_bonus_cents integer := 0;
  v_event_created_at timestamptz;
  v_coupon_code text;
begin
  select *
  into v_transaction
  from wallet_transactions
  where wallet_transactions.id = p_wallet_transaction_id
  for update;

  if not found then
    raise exception 'wallet_transaction_not_found';
  end if;

  if v_transaction.type <> 'top_up' then
    raise exception 'wallet_transaction_not_top_up';
  end if;

  if v_transaction.status = 'completed' then
    select *
    into v_wallet
    from wallets
    where wallets.id = v_transaction.wallet_id;

    select *
    into v_payment
    from payments
    where payments.provider_checkout_session_id =
      p_provider_checkout_session_id
    limit 1;

    select *
    into v_redemption
    from wallet_coupon_redemptions
    where wallet_coupon_redemptions.wallet_transaction_id = v_transaction.id
    limit 1;

    if found and v_redemption.status = 'redeemed' then
      v_bonus_cents := v_redemption.bonus_amount_cents;
      v_coupon_code := v_redemption.code_snapshot;

      if v_redemption.bonus_wallet_transaction_id is not null then
        select *
        into v_bonus_transaction
        from wallet_transactions
        where id = v_redemption.bonus_wallet_transaction_id;
      end if;
    end if;

    return query select
      v_transaction.wallet_id,
      v_transaction.profile_id,
      v_transaction.id,
      v_transaction.amount_cents,
      v_bonus_cents,
      coalesce(v_transaction.balance_after_cents, v_wallet.balance_cents),
      v_payment.id,
      v_coupon_code,
      v_bonus_transaction.id;
    return;
  end if;

  if v_transaction.status <> 'pending' then
    raise exception 'wallet_transaction_not_pending';
  end if;

  if v_transaction.amount_cents <> p_amount_cents then
    raise exception 'wallet_transaction_amount_mismatch';
  end if;

  select *
  into v_wallet
  from wallets
  where wallets.id = v_transaction.wallet_id
  for update;

  if not found then
    raise exception 'wallet_not_found';
  end if;

  if lower(v_wallet.currency) <> lower(p_currency) then
    raise exception 'wallet_currency_mismatch';
  end if;

  select *
  into v_redemption
  from wallet_coupon_redemptions
  where wallet_coupon_redemptions.wallet_transaction_id = v_transaction.id
  for update;

  if found and v_redemption.status = 'pending' then
    begin
      v_event_created_at :=
        to_timestamp((p_raw_event ->> 'created')::double precision);
    exception when others then
      v_event_created_at := now();
    end;

    if v_event_created_at > v_redemption.expires_at + interval '5 minutes' then
      update wallet_coupon_redemptions
      set
        status = 'expired',
        cancelled_at = now(),
        cancellation_reason = 'payment_after_reservation_expiry'
      where id = v_redemption.id;
    elsif v_redemption.first_top_up_only and exists (
      select 1
      from wallet_transactions wt
      where wt.profile_id = v_transaction.profile_id
        and wt.type = 'top_up'
        and wt.status = 'completed'
        and wt.id <> v_transaction.id
    ) then
      update wallet_coupon_redemptions
      set
        status = 'cancelled',
        cancelled_at = now(),
        cancellation_reason = 'first_top_up_already_completed'
      where id = v_redemption.id;
    elsif v_redemption.paid_amount_cents <> p_amount_cents then
      update wallet_coupon_redemptions
      set
        status = 'cancelled',
        cancelled_at = now(),
        cancellation_reason = 'paid_amount_mismatch'
      where id = v_redemption.id;
    else
      v_bonus_cents := v_redemption.bonus_amount_cents;
      v_coupon_code := v_redemption.code_snapshot;
    end if;
  end if;

  v_new_balance_cents :=
    v_wallet.balance_cents + p_amount_cents + v_bonus_cents;

  update wallets
  set balance_cents = v_new_balance_cents
  where wallets.id = v_wallet.id
  returning * into v_wallet;

  update wallet_transactions
  set
    status = 'completed',
    balance_after_cents = v_new_balance_cents,
    provider = 'stripe',
    provider_reference = p_provider_checkout_session_id,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'stripe_payment_intent', p_provider_payment_id,
      'coupon_code', v_coupon_code,
      'coupon_bonus_cents', v_bonus_cents
    ),
    completed_at = now()
  where wallet_transactions.id = v_transaction.id
  returning * into v_transaction;

  if v_bonus_cents > 0 then
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
      metadata,
      completed_at
    ) values (
      v_wallet.id,
      v_transaction.profile_id,
      'adjustment',
      'completed',
      v_bonus_cents,
      v_new_balance_cents,
      'Bonus coupon ' || v_coupon_code,
      'coupon',
      v_redemption.id::text,
      jsonb_build_object(
        'reason', 'coupon_bonus',
        'coupon_id', v_redemption.coupon_id,
        'coupon_code', v_coupon_code,
        'redemption_id', v_redemption.id,
        'source_wallet_transaction_id', v_transaction.id
      ),
      now()
    )
    returning * into v_bonus_transaction;

    update wallet_coupon_redemptions
    set
      status = 'redeemed',
      provider_checkout_session_id = p_provider_checkout_session_id,
      redeemed_at = now(),
      bonus_wallet_transaction_id = v_bonus_transaction.id
    where id = v_redemption.id
    returning * into v_redemption;
  end if;

  insert into payments (
    purchase_attempt_id,
    provider,
    provider_payment_id,
    provider_checkout_session_id,
    amount_cents,
    currency,
    status,
    raw_event,
    confirmed_at
  ) values (
    null,
    'stripe',
    nullif(p_provider_payment_id, ''),
    p_provider_checkout_session_id,
    p_amount_cents,
    lower(p_currency),
    'completed',
    p_raw_event,
    now()
  )
  on conflict (provider_checkout_session_id) do update
  set
    status = 'completed',
    raw_event = excluded.raw_event,
    confirmed_at = coalesce(payments.confirmed_at, excluded.confirmed_at)
  returning * into v_payment;

  return query select
    v_wallet.id,
    v_wallet.profile_id,
    v_transaction.id,
    v_transaction.amount_cents,
    v_bonus_cents,
    v_wallet.balance_cents,
    v_payment.id,
    v_coupon_code,
    v_bonus_transaction.id;
end;
$$;

revoke all on function preview_wallet_top_up_coupon(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function preview_wallet_top_up_coupon(uuid, text, integer)
  to service_role;

revoke all on function reserve_wallet_top_up_coupon(
  uuid, uuid, text, integer, timestamptz
) from public, anon, authenticated;
grant execute on function reserve_wallet_top_up_coupon(
  uuid, uuid, text, integer, timestamptz
) to service_role;

revoke all on function cancel_wallet_top_up_coupon_reservation(uuid, text)
  from public, anon, authenticated;
grant execute on function cancel_wallet_top_up_coupon_reservation(uuid, text)
  to service_role;

revoke all on function complete_wallet_top_up(
  uuid, text, text, integer, text, jsonb
) from public, anon, authenticated;
grant execute on function complete_wallet_top_up(
  uuid, text, text, integer, text, jsonb
) to service_role;
