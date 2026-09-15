-- Percentage-based wallet coupons. Existing tier coupons remain unchanged.

alter table wallet_coupons
  add column if not exists bonus_mode text not null default 'fixed_tiers',
  add column if not exists bonus_percentage_basis_points integer,
  add column if not exists percentage_min_paid_cents integer,
  add column if not exists max_bonus_per_redemption_cents integer;

alter table wallet_coupons
  add constraint wallet_coupons_bonus_mode
    check (bonus_mode in ('fixed_tiers', 'percentage')),
  add constraint wallet_coupons_percentage_valid
    check (
      (bonus_mode = 'fixed_tiers' and bonus_percentage_basis_points is null)
      or (
        bonus_mode = 'percentage'
        and bonus_percentage_basis_points between 1 and 10000
      )
    ),
  add constraint wallet_coupons_percentage_min_paid
    check (percentage_min_paid_cents is null or percentage_min_paid_cents > 0),
  add constraint wallet_coupons_max_bonus_per_redemption
    check (
      max_bonus_per_redemption_cents is null
      or max_bonus_per_redemption_cents > 0
    );

create or replace function preview_wallet_top_up_coupon_v2(
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
  v_feature_enabled boolean;
  v_profile_redemptions integer;
  v_total_redemptions integer;
  v_bonus_spent_cents bigint;
  v_bonus_cents integer;
  v_coupon_found boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  if p_profile_id is null or p_paid_amount_cents <= 0 then
    raise exception 'coupon_invalid_request';
  end if;

  select *
  into v_coupon
  from wallet_coupons wc
  where wc.code = upper(btrim(p_code))
  limit 1;

  v_coupon_found := found;

  if v_coupon_found and v_coupon.bonus_mode = 'fixed_tiers' then
    return query
      select * from preview_wallet_top_up_coupon(
        p_profile_id,
        p_code,
        p_paid_amount_cents
      );
    return;
  end if;

  select coalesce((s.value #>> '{}')::boolean, false)
  into v_feature_enabled
  from settings s
  where s.key = 'wallet.coupons_enabled';

  if not coalesce(v_feature_enabled, false) then
    raise exception 'coupons_disabled';
  end if;

  if not v_coupon_found or not v_coupon.active then
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

  if v_coupon.percentage_min_paid_cents is not null
    and p_paid_amount_cents < v_coupon.percentage_min_paid_cents then
    raise exception 'coupon_amount_not_eligible';
  end if;

  v_bonus_cents := round(
    p_paid_amount_cents::numeric
      * v_coupon.bonus_percentage_basis_points::numeric
      / 10000
  )::integer;

  if v_coupon.max_bonus_per_redemption_cents is not null then
    v_bonus_cents := least(
      v_bonus_cents,
      v_coupon.max_bonus_per_redemption_cents
    );
  end if;

  if v_bonus_cents <= 0 then
    raise exception 'coupon_amount_not_eligible';
  end if;

  if v_coupon.bonus_budget_cents is not null
    and v_bonus_spent_cents + v_bonus_cents > v_coupon.bonus_budget_cents then
    raise exception 'coupon_budget_exhausted';
  end if;

  return query select
    v_coupon.id,
    v_coupon.code,
    v_coupon.name,
    p_paid_amount_cents,
    v_bonus_cents,
    p_paid_amount_cents + v_bonus_cents,
    v_coupon.first_top_up_only,
    v_coupon.valid_until;
end;
$$;

create or replace function reserve_wallet_top_up_coupon_v2(
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
  v_redemption wallet_coupon_redemptions;
  v_transaction wallet_transactions;
  v_feature_enabled boolean;
  v_profile_redemptions integer;
  v_total_redemptions integer;
  v_bonus_reserved_cents bigint;
  v_bonus_cents integer;
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

  select *
  into v_coupon
  from wallet_coupons wc
  where wc.code = upper(btrim(p_code))
  limit 1;

  if found and v_coupon.bonus_mode = 'fixed_tiers' then
    return query
      select * from reserve_wallet_top_up_coupon(
        p_profile_id,
        p_wallet_transaction_id,
        p_code,
        p_paid_amount_cents,
        p_expires_at
      );
    return;
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

  if v_coupon.percentage_min_paid_cents is not null
    and p_paid_amount_cents < v_coupon.percentage_min_paid_cents then
    raise exception 'coupon_amount_not_eligible';
  end if;

  v_bonus_cents := round(
    p_paid_amount_cents::numeric
      * v_coupon.bonus_percentage_basis_points::numeric
      / 10000
  )::integer;

  if v_coupon.max_bonus_per_redemption_cents is not null then
    v_bonus_cents := least(
      v_bonus_cents,
      v_coupon.max_bonus_per_redemption_cents
    );
  end if;

  if v_bonus_cents <= 0 then
    raise exception 'coupon_amount_not_eligible';
  end if;

  if v_coupon.bonus_budget_cents is not null
    and v_bonus_reserved_cents + v_bonus_cents > v_coupon.bonus_budget_cents then
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
    v_bonus_cents,
    v_coupon.first_top_up_only,
    jsonb_build_object(
      'coupon_name', v_coupon.name,
      'partner_name', v_coupon.partner_name,
      'bonus_mode', v_coupon.bonus_mode,
      'bonus_percentage_basis_points', v_coupon.bonus_percentage_basis_points,
      'percentage_min_paid_cents', v_coupon.percentage_min_paid_cents,
      'max_bonus_per_redemption_cents', v_coupon.max_bonus_per_redemption_cents,
      'bonus_cents', v_bonus_cents,
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
    v_bonus_cents,
    p_paid_amount_cents + v_bonus_cents,
    v_redemption.expires_at,
    v_coupon.first_top_up_only,
    v_coupon.valid_until;
end;
$$;

revoke all on function preview_wallet_top_up_coupon_v2(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function preview_wallet_top_up_coupon_v2(uuid, text, integer)
  to service_role;

revoke all on function reserve_wallet_top_up_coupon_v2(
  uuid, uuid, text, integer, timestamptz
) from public, anon, authenticated;
grant execute on function reserve_wallet_top_up_coupon_v2(
  uuid, uuid, text, integer, timestamptz
) to service_role;
