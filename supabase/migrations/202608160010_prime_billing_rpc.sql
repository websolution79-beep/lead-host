-- Atomic and idempotent PRIME invoice settlement.
-- Run after 202608160009_prime_billing_ledger.sql has committed.

create or replace function public.complete_prime_billing_period(
  p_prime_account_id uuid,
  p_addon_subscription_id uuid,
  p_profile_id uuid,
  p_provider_invoice_id text,
  p_provider_payment_intent_id text,
  p_provider_checkout_session_id text,
  p_provider_subscription_id text,
  p_period_kind text,
  p_membership_amount_cents integer,
  p_wallet_recharge_amount_cents integer,
  p_total_amount_cents integer,
  p_currency text,
  p_billing_period_started_at timestamptz,
  p_billing_period_ends_at timestamptz,
  p_metadata jsonb
)
returns table (
  prime_billing_period_id uuid,
  wallet_transaction_id uuid,
  profile_id uuid,
  membership_amount_cents integer,
  wallet_recharge_amount_cents integer,
  total_amount_cents integer,
  balance_cents integer,
  already_completed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.prime_accounts;
  v_subscription public.addon_subscriptions;
  v_period public.prime_billing_periods;
  v_wallet public.wallets;
  v_wallet_transaction public.wallet_transactions;
  v_previous_status text;
  v_now timestamptz := now();
begin
  if p_period_kind not in ('initial', 'renewal', 'adjustment') then
    raise exception 'prime_billing_period_kind_invalid';
  end if;

  if p_membership_amount_cents < 0
    or p_wallet_recharge_amount_cents < 0
    or p_total_amount_cents <= 0
    or p_total_amount_cents <> p_membership_amount_cents + p_wallet_recharge_amount_cents then
    raise exception 'prime_billing_amount_mismatch';
  end if;

  select * into v_account
  from public.prime_accounts
  where id = p_prime_account_id
  for update;

  if not found or v_account.profile_id <> p_profile_id then
    raise exception 'prime_account_not_found';
  end if;

  select * into v_subscription
  from public.addon_subscriptions
  where id = p_addon_subscription_id
  for update;

  if not found
    or v_subscription.profile_id <> p_profile_id
    or coalesce(v_subscription.stripe_subscription_id, p_provider_subscription_id) <> p_provider_subscription_id then
    raise exception 'prime_subscription_not_found';
  end if;

  select * into v_period
  from public.prime_billing_periods
  where provider = 'stripe'
    and provider_invoice_id = p_provider_invoice_id
  for update;

  if found and v_period.status = 'paid' then
    if v_period.wallet_transaction_id is not null then
      select * into v_wallet_transaction
      from public.wallet_transactions
      where id = v_period.wallet_transaction_id;
    end if;

    select * into v_wallet
    from public.wallets
    where profile_id = p_profile_id;

    return query select
      v_period.id,
      v_period.wallet_transaction_id,
      v_period.profile_id,
      v_period.membership_amount_cents,
      v_period.wallet_recharge_amount_cents,
      v_period.total_amount_cents,
      coalesce(v_wallet_transaction.balance_after_cents, v_wallet.balance_cents, 0),
      true;
    return;
  end if;

  if not found then
    insert into public.prime_billing_periods (
      prime_account_id,
      addon_subscription_id,
      profile_id,
      period_kind,
      status,
      provider_invoice_id,
      provider_payment_intent_id,
      provider_checkout_session_id,
      provider_subscription_id,
      membership_amount_cents,
      wallet_recharge_amount_cents,
      total_amount_cents,
      currency,
      billing_period_started_at,
      billing_period_ends_at,
      metadata
    ) values (
      p_prime_account_id,
      p_addon_subscription_id,
      p_profile_id,
      p_period_kind,
      'pending',
      p_provider_invoice_id,
      nullif(p_provider_payment_intent_id, ''),
      nullif(p_provider_checkout_session_id, ''),
      p_provider_subscription_id,
      p_membership_amount_cents,
      p_wallet_recharge_amount_cents,
      p_total_amount_cents,
      lower(p_currency),
      p_billing_period_started_at,
      p_billing_period_ends_at,
      coalesce(p_metadata, '{}'::jsonb)
    ) returning * into v_period;
  else
    if v_period.profile_id <> p_profile_id
      or v_period.prime_account_id <> p_prime_account_id
      or v_period.addon_subscription_id <> p_addon_subscription_id
      or v_period.total_amount_cents <> p_total_amount_cents
      or v_period.wallet_recharge_amount_cents <> p_wallet_recharge_amount_cents then
      raise exception 'prime_billing_invoice_conflict';
    end if;
  end if;

  insert into public.wallets (profile_id, currency)
  values (p_profile_id, lower(p_currency))
  on conflict (profile_id) do nothing;

  select * into v_wallet
  from public.wallets
  where profile_id = p_profile_id
  for update;

  if lower(v_wallet.currency) <> lower(p_currency) then
    raise exception 'prime_wallet_currency_mismatch';
  end if;

  if p_wallet_recharge_amount_cents > 0 then
    update public.wallets
    set balance_cents = balance_cents + p_wallet_recharge_amount_cents
    where id = v_wallet.id
    returning * into v_wallet;

    insert into public.wallet_transactions (
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
      p_profile_id,
      'prime_wallet_recharge',
      'completed',
      p_wallet_recharge_amount_cents,
      v_wallet.balance_cents,
      case when p_period_kind = 'initial'
        then 'Ricarica Wallet inclusa nell’attivazione PRIME'
        else 'Ricarica Wallet mensile inclusa in PRIME'
      end,
      'stripe',
      p_provider_invoice_id,
      jsonb_build_object(
        'reason', 'prime_wallet_recharge',
        'prime_account_id', p_prime_account_id,
        'addon_subscription_id', p_addon_subscription_id,
        'stripe_invoice_id', p_provider_invoice_id,
        'stripe_subscription_id', p_provider_subscription_id,
        'period_kind', p_period_kind,
        'membership_amount_cents', p_membership_amount_cents,
        'invoice_total_cents', p_total_amount_cents
      ),
      v_now
    ) returning * into v_wallet_transaction;
  end if;

  update public.prime_billing_periods
  set
    status = 'paid',
    provider_payment_intent_id = nullif(p_provider_payment_intent_id, ''),
    provider_checkout_session_id = coalesce(nullif(p_provider_checkout_session_id, ''), provider_checkout_session_id),
    wallet_transaction_id = v_wallet_transaction.id,
    paid_at = v_now,
    failed_at = null,
    metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb)
  where id = v_period.id
  returning * into v_period;

  v_previous_status := v_account.status;

  update public.prime_accounts
  set
    addon_subscription_id = p_addon_subscription_id,
    status = 'active',
    access_source = 'stripe',
    prime_started_at = coalesce(prime_started_at, p_billing_period_started_at, v_now),
    prime_expires_at = p_billing_period_ends_at,
    last_activated_at = case when p_period_kind = 'initial' then v_now else last_activated_at end,
    last_renewed_at = case when p_period_kind = 'renewal' then v_now else last_renewed_at end,
    grace_ends_at = null,
    payment_status = 'paid',
    admin_override_active = false
  where id = p_prime_account_id;

  insert into public.prime_account_events (
    prime_account_id,
    profile_id,
    addon_subscription_id,
    event_type,
    from_status,
    to_status,
    reason,
    metadata
  ) values (
    p_prime_account_id,
    p_profile_id,
    p_addon_subscription_id,
    case when p_period_kind = 'initial' then 'prime.subscription_activated' else 'prime.subscription_renewed' end,
    v_previous_status,
    'active',
    case when p_period_kind = 'initial' then 'Prima fattura PRIME pagata' else 'Rinnovo PRIME pagato' end,
    jsonb_build_object(
      'prime_billing_period_id', v_period.id,
      'stripe_invoice_id', p_provider_invoice_id,
      'membership_amount_cents', p_membership_amount_cents,
      'wallet_recharge_amount_cents', p_wallet_recharge_amount_cents,
      'total_amount_cents', p_total_amount_cents,
      'wallet_transaction_id', v_wallet_transaction.id
    )
  );

  return query select
    v_period.id,
    v_period.wallet_transaction_id,
    v_period.profile_id,
    v_period.membership_amount_cents,
    v_period.wallet_recharge_amount_cents,
    v_period.total_amount_cents,
    v_wallet.balance_cents,
    false;
end;
$$;

revoke all on function public.complete_prime_billing_period(
  uuid, uuid, uuid, text, text, text, text, text, integer, integer, integer,
  text, timestamptz, timestamptz, jsonb
) from public, anon, authenticated;

grant execute on function public.complete_prime_billing_period(
  uuid, uuid, uuid, text, text, text, text, text, integer, integer, integer,
  text, timestamptz, timestamptz, jsonb
) to service_role;

create or replace function public.fail_prime_billing_period(
  p_prime_account_id uuid,
  p_addon_subscription_id uuid,
  p_profile_id uuid,
  p_provider_invoice_id text,
  p_provider_subscription_id text,
  p_status text,
  p_membership_amount_cents integer,
  p_wallet_recharge_amount_cents integer,
  p_total_amount_cents integer,
  p_currency text,
  p_billing_period_started_at timestamptz,
  p_billing_period_ends_at timestamptz,
  p_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.prime_accounts;
  v_previous_status text;
begin
  if p_status not in ('failed', 'void', 'uncollectible') then
    raise exception 'prime_billing_failure_status_invalid';
  end if;

  select * into v_account
  from public.prime_accounts
  where id = p_prime_account_id
    and profile_id = p_profile_id
  for update;

  if not found then
    raise exception 'prime_account_not_found';
  end if;

  insert into public.prime_billing_periods (
    prime_account_id,
    addon_subscription_id,
    profile_id,
    period_kind,
    status,
    provider_invoice_id,
    provider_subscription_id,
    membership_amount_cents,
    wallet_recharge_amount_cents,
    total_amount_cents,
    currency,
    billing_period_started_at,
    billing_period_ends_at,
    failed_at,
    metadata
  ) values (
    p_prime_account_id,
    p_addon_subscription_id,
    p_profile_id,
    'renewal',
    p_status,
    p_provider_invoice_id,
    p_provider_subscription_id,
    p_membership_amount_cents,
    p_wallet_recharge_amount_cents,
    p_total_amount_cents,
    lower(p_currency),
    p_billing_period_started_at,
    p_billing_period_ends_at,
    now(),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (provider, provider_invoice_id) do update
  set
    status = excluded.status,
    failed_at = coalesce(public.prime_billing_periods.failed_at, excluded.failed_at),
    metadata = public.prime_billing_periods.metadata || excluded.metadata;

  v_previous_status := v_account.status;

  update public.prime_accounts
  set
    status = 'past_due',
    access_source = 'stripe',
    addon_subscription_id = p_addon_subscription_id,
    payment_status = case when p_status = 'uncollectible' then 'unpaid' else 'past_due' end,
    grace_ends_at = now() + interval '3 days'
  where id = p_prime_account_id;

  insert into public.prime_account_events (
    prime_account_id,
    profile_id,
    addon_subscription_id,
    event_type,
    from_status,
    to_status,
    reason,
    metadata
  ) values (
    p_prime_account_id,
    p_profile_id,
    p_addon_subscription_id,
    'prime.payment_failed',
    v_previous_status,
    'past_due',
    'Pagamento PRIME non riuscito: periodo di tolleranza di 3 giorni',
    jsonb_build_object(
      'stripe_invoice_id', p_provider_invoice_id,
      'failure_status', p_status,
      'grace_ends_at', now() + interval '3 days'
    )
  );
end;
$$;

revoke all on function public.fail_prime_billing_period(
  uuid, uuid, uuid, text, text, text, integer, integer, integer,
  text, timestamptz, timestamptz, jsonb
) from public, anon, authenticated;

grant execute on function public.fail_prime_billing_period(
  uuid, uuid, uuid, text, text, text, integer, integer, integer,
  text, timestamptz, timestamptz, jsonb
) to service_role;
