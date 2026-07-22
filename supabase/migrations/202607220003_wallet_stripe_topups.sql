create unique index if not exists wallet_transactions_provider_reference_unique
  on wallet_transactions (provider, provider_reference)
  where provider is not null and provider_reference is not null;

create or replace function complete_wallet_top_up(
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
  balance_cents integer,
  payment_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction wallet_transactions;
  v_wallet wallets;
  v_payment payments;
  v_new_balance_cents integer;
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
    where payments.provider_checkout_session_id = p_provider_checkout_session_id
    limit 1;

    return query select
      v_transaction.wallet_id,
      v_transaction.profile_id,
      v_transaction.id,
      v_transaction.amount_cents,
      coalesce(v_transaction.balance_after_cents, v_wallet.balance_cents),
      v_payment.id;
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

  v_new_balance_cents := v_wallet.balance_cents + p_amount_cents;

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
      'stripe_payment_intent', p_provider_payment_id
    ),
    completed_at = now()
  where wallet_transactions.id = v_transaction.id
  returning * into v_transaction;

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
    v_wallet.balance_cents,
    v_payment.id;
end;
$$;

create or replace function fail_wallet_top_up(
  p_wallet_transaction_id uuid,
  p_provider_checkout_session_id text,
  p_status wallet_transaction_status,
  p_raw_event jsonb
)
returns wallet_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction wallet_transactions;
begin
  if p_status not in ('failed', 'cancelled') then
    raise exception 'invalid_wallet_transaction_failure_status';
  end if;

  update wallet_transactions
  set
    status = p_status,
    provider = 'stripe',
    provider_reference = p_provider_checkout_session_id,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'stripe_event', p_raw_event
    )
  where id = p_wallet_transaction_id
    and status = 'pending'
  returning * into v_transaction;

  if not found then
    select *
    into v_transaction
    from wallet_transactions
    where id = p_wallet_transaction_id;
  end if;

  return v_transaction;
end;
$$;
