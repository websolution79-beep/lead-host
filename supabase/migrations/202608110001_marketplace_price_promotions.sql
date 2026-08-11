create table if not exists public.marketplace_price_promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'active', 'ended', 'cancelled')),
  starts_at timestamptz,
  ends_at timestamptz,
  apply_shared boolean not null default false,
  apply_exclusive boolean not null default true,
  rules jsonb not null default '[]'::jsonb
    check (jsonb_typeof(rules) = 'array'),
  created_by uuid references public.profiles(id) on delete set null,
  activated_by uuid references public.profiles(id) on delete set null,
  ended_by uuid references public.profiles(id) on delete set null,
  activated_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_price_promotions_period_check
    check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint marketplace_price_promotions_modes_check
    check (apply_shared or apply_exclusive)
);

create index if not exists marketplace_price_promotions_effective_idx
  on public.marketplace_price_promotions (status, starts_at, ends_at);

drop trigger if exists marketplace_price_promotions_updated_at
  on public.marketplace_price_promotions;
create trigger marketplace_price_promotions_updated_at
before update on public.marketplace_price_promotions
for each row execute function public.set_updated_at();

alter table public.marketplace_price_promotions enable row level security;
revoke all on table public.marketplace_price_promotions from public, anon, authenticated;
grant all on table public.marketplace_price_promotions to service_role;

create or replace function public.resolve_marketplace_promotional_price(
  p_base_price_cents integer,
  p_mode purchase_mode,
  p_at timestamptz default now()
)
returns table (
  effective_price_cents integer,
  promotion_id uuid,
  promotion_name text
)
language sql
stable
security definer
set search_path = public
as $$
  with active_promotion as (
    select promotion.id, promotion.name, promotion.rules
    from public.marketplace_price_promotions promotion
    where (
      (
          promotion.status = 'active'
          and (promotion.ends_at is null or promotion.ends_at > p_at)
        ) or (
          promotion.status = 'scheduled'
          and promotion.starts_at is not null
          and promotion.starts_at <= p_at
          and promotion.ends_at is not null
          and promotion.ends_at > p_at
        )
      )
      and case
        when p_mode = 'shared' then promotion.apply_shared
        else promotion.apply_exclusive
      end
    order by
      case when promotion.status = 'active' then 0 else 1 end,
      promotion.activated_at desc nulls last,
      promotion.created_at desc
    limit 1
  ), matching_rule as (
    select
      active_promotion.id,
      active_promotion.name,
      (rule.value ->> 'promotionalPriceCents')::integer as promotional_price_cents
    from active_promotion
    cross join lateral jsonb_array_elements(active_promotion.rules) rule(value)
    where rule.value ->> 'mode' = p_mode::text
      and (rule.value ->> 'basePriceCents')::integer = p_base_price_cents
      and (rule.value ->> 'promotionalPriceCents')::integer > 0
    limit 1
  )
  select
    coalesce(matching_rule.promotional_price_cents, p_base_price_cents),
    matching_rule.id,
    matching_rule.name
  from (select 1) seed
  left join matching_rule on true;
$$;

revoke execute on function public.resolve_marketplace_promotional_price(integer, purchase_mode, timestamptz)
  from public, anon, authenticated;
grant execute on function public.resolve_marketplace_promotional_price(integer, purchase_mode, timestamptz)
  to service_role;

create or replace function public.purchase_lead_with_wallet(
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
  v_base_amount_cents integer;
  v_amount_cents integer;
  v_promotion_id uuid;
  v_promotion_name text;
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

  select * into v_wallet
  from wallets
  where wallets.profile_id = p_profile_id
  for update;

  if not found then raise exception 'wallet_not_found'; end if;

  select * into v_lead
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
    select 1 from lead_purchases lp
    where lp.lead_id = p_lead_id
      and lp.property_manager_id = p_property_manager_id
      and lp.status in ('paid', 'contact_unlocked')
  ) then
    raise exception 'already_purchased';
  end if;

  if p_mode = 'exclusive' then
    if v_lead.internal_status <> 'available'
      or v_lead.shared_slots_sold <> 0
      or v_lead.exclusive_purchase_id is not null
    then
      raise exception 'exclusive_not_available';
    end if;
    v_base_amount_cents := v_lead.exclusive_price_cents;
  else
    if v_lead.exclusive_purchase_id is not null
      or v_lead.shared_slots_sold >= 2
      or v_lead.internal_status in (
        'sold_two_pm', 'sold_exclusive', 'withdrawn_after_7_days',
        'cancelled', 'refunded'
      )
    then
      raise exception 'shared_slot_not_available';
    end if;
    v_base_amount_cents := v_lead.shared_price_cents;
  end if;

  select effective_price_cents, promotion_id, promotion_name
  into v_amount_cents, v_promotion_id, v_promotion_name
  from public.resolve_marketplace_promotional_price(
    v_base_amount_cents,
    p_mode,
    now()
  );

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
    lead_id, property_manager_id, purchase_attempt_id, mode,
    amount_cents, status, unlocked_at
  ) values (
    p_lead_id, p_property_manager_id, null, p_mode,
    v_amount_cents, 'contact_unlocked', now()
  ) returning * into v_purchase;

  if p_mode = 'exclusive' then
    update leads set
      shared_slots_sold = 0,
      exclusive_purchase_id = v_purchase.id,
      internal_status = 'sold_exclusive',
      public_status = 'unavailable'
    where leads.id = p_lead_id
    returning * into v_lead;
  else
    v_shared_slots_sold := v_lead.shared_slots_sold + 1;
    update leads set
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
  update wallets set balance_cents = v_new_balance_cents where id = v_wallet.id;

  insert into wallet_transactions (
    wallet_id, profile_id, type, status, amount_cents, balance_after_cents,
    description, provider, provider_reference, lead_purchase_id, metadata,
    completed_at
  ) values (
    v_wallet.id, p_profile_id, 'lead_purchase', 'completed', -v_amount_cents,
    v_new_balance_cents, 'Acquisto lead: ' || v_lead.title, 'wallet',
    v_purchase.id::text, v_purchase.id,
    jsonb_build_object(
      'lead_id', p_lead_id,
      'purchase_mode', p_mode,
      'base_amount_cents', v_base_amount_cents,
      'promotion_id', v_promotion_id,
      'promotion_name', v_promotion_name
    ),
    now()
  );

  insert into terms_acceptances (
    profile_id, context, terms_version, lead_purchase_id, metadata
  ) values (
    p_profile_id, 'lead_purchase', p_terms_version, v_purchase.id,
    jsonb_build_object(
      'lead_id', p_lead_id,
      'purchase_mode', p_mode,
      'amount_cents', v_amount_cents,
      'base_amount_cents', v_base_amount_cents,
      'promotion_id', v_promotion_id
    )
  );

  return query select
    v_lead.id, v_lead.title, v_purchase.id, v_purchase.mode,
    v_amount_cents, v_new_balance_cents,
    case
      when v_lead.exclusive_purchase_id is not null then 0
      when v_lead.internal_status in (
        'sold_exclusive', 'sold_two_pm', 'withdrawn_after_7_days',
        'cancelled', 'refunded'
      ) then 0
      else greatest(2 - v_lead.shared_slots_sold, 0)
    end,
    v_lead.internal_status,
    v_lead.public_status;
end;
$$;

revoke execute on function public.purchase_lead_with_wallet(
  uuid, uuid, uuid, purchase_mode, integer, text
) from public, anon, authenticated;
grant execute on function public.purchase_lead_with_wallet(
  uuid, uuid, uuid, purchase_mode, integer, text
) to service_role;
