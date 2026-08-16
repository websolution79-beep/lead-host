-- Allow the existing atomic Wallet purchase to handle a private PRIME lead.
-- The public Marketplace branch retains its current validation and promotion logic.

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
  v_is_prime_private boolean := false;
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

  if not found then
    raise exception 'lead_not_found';
  end if;

  v_is_prime_private := v_lead.visibility_mode = 'prime_private';

  if v_is_prime_private then
    if p_mode <> 'exclusive'::purchase_mode then
      raise exception 'prime_exclusive_only';
    end if;

    if v_lead.prime_access_until is null or v_lead.prime_access_until <= now() then
      raise exception 'prime_access_expired';
    end if;

    if not public.profile_can_access_prime_lead(
      p_profile_id,
      p_lead_id,
      now()
    ) then
      raise exception 'prime_access_denied';
    end if;
  else
    if v_lead.visibility_mode <> 'public' or v_lead.published_at is null then
      raise exception 'lead_not_found';
    end if;

    if coalesce(v_lead.expires_at, v_lead.visible_until, v_lead.created_at) <= now() then
      raise exception 'lead_unavailable';
    end if;
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

  if v_is_prime_private then
    v_amount_cents := v_base_amount_cents;
    v_promotion_id := null;
    v_promotion_name := null;
  else
    select effective_price_cents, promotion_id, promotion_name
    into v_amount_cents, v_promotion_id, v_promotion_name
    from public.resolve_marketplace_promotional_price(
      v_base_amount_cents,
      p_mode,
      now()
    );
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
      'promotion_name', v_promotion_name,
      'visibility_mode', v_lead.visibility_mode,
      'prime_purchase', v_is_prime_private
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
      'promotion_id', v_promotion_id,
      'prime_purchase', v_is_prime_private
    )
  );

  if v_is_prime_private then
    insert into prime_lead_events (
      lead_id,
      target_property_manager_id,
      actor_profile_id,
      event_type,
      from_visibility_mode,
      to_visibility_mode,
      access_until,
      metadata
    ) values (
      v_lead.id,
      p_property_manager_id,
      p_profile_id,
      'purchased_in_prime',
      'prime_private',
      'prime_private',
      v_lead.prime_access_until,
      jsonb_build_object(
        'purchase_id', v_purchase.id,
        'amount_cents', v_amount_cents,
        'mode', p_mode
      )
    );
  end if;

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
