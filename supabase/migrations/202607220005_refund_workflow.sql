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

  select *
  into v_property_manager
  from property_manager_profiles
  where property_manager_profiles.id = v_refund.requested_by_property_manager_id;

  if not found then
    raise exception 'property_manager_not_found';
  end if;

  v_amount_cents := coalesce(v_refund.amount_cents, v_purchase.amount_cents);

  if v_amount_cents <= 0 or v_amount_cents > v_purchase.amount_cents then
    raise exception 'invalid_refund_amount';
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
    'Rimborso lead',
    'wallet',
    v_refund.id::text,
    v_purchase.id,
    jsonb_build_object(
      'refund_id', v_refund.id,
      'lead_id', v_purchase.lead_id,
      'reviewed_by', p_reviewer_profile_id
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
    'refund.paid_to_wallet',
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
