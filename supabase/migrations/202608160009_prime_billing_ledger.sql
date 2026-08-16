-- PRIME billing ledger and dedicated Wallet transaction category.
-- This migration is additive and does not enable checkout by itself.

alter type public.wallet_transaction_type
  add value if not exists 'prime_wallet_recharge';

create table if not exists public.prime_billing_periods (
  id uuid primary key default gen_random_uuid(),
  prime_account_id uuid not null references public.prime_accounts(id) on delete restrict,
  addon_subscription_id uuid not null references public.addon_subscriptions(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  period_kind text not null,
  status text not null default 'pending',
  provider text not null default 'stripe',
  provider_invoice_id text not null,
  provider_payment_intent_id text,
  provider_checkout_session_id text,
  provider_subscription_id text not null,
  membership_amount_cents integer not null default 0,
  wallet_recharge_amount_cents integer not null default 0,
  total_amount_cents integer not null default 0,
  currency text not null default 'eur',
  billing_period_started_at timestamptz,
  billing_period_ends_at timestamptz,
  wallet_transaction_id uuid unique references public.wallet_transactions(id) on delete restrict,
  paid_at timestamptz,
  failed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prime_billing_periods_kind_valid
    check (period_kind in ('initial', 'renewal', 'adjustment')),
  constraint prime_billing_periods_status_valid
    check (status in ('pending', 'paid', 'failed', 'void', 'uncollectible')),
  constraint prime_billing_periods_provider_valid
    check (provider = 'stripe'),
  constraint prime_billing_periods_amounts_valid
    check (
      membership_amount_cents >= 0
      and wallet_recharge_amount_cents >= 0
      and total_amount_cents = membership_amount_cents + wallet_recharge_amount_cents
      and total_amount_cents > 0
    ),
  constraint prime_billing_periods_currency_valid
    check (currency ~ '^[a-z]{3}$'),
  constraint prime_billing_periods_period_valid
    check (
      billing_period_started_at is null
      or billing_period_ends_at is null
      or billing_period_ends_at > billing_period_started_at
    )
);

create unique index if not exists prime_billing_periods_invoice_unique_idx
  on public.prime_billing_periods (provider, provider_invoice_id);

create index if not exists prime_billing_periods_profile_created_idx
  on public.prime_billing_periods (profile_id, created_at desc);

create index if not exists prime_billing_periods_account_created_idx
  on public.prime_billing_periods (prime_account_id, created_at desc);

create index if not exists prime_billing_periods_status_created_idx
  on public.prime_billing_periods (status, created_at desc);

drop trigger if exists prime_billing_periods_updated_at on public.prime_billing_periods;
create trigger prime_billing_periods_updated_at
before update on public.prime_billing_periods
for each row execute function public.set_updated_at();

alter table public.prime_billing_periods enable row level security;

drop policy if exists "prime_billing_periods_owner_read" on public.prime_billing_periods;
create policy "prime_billing_periods_owner_read"
on public.prime_billing_periods for select
to authenticated
using (profile_id = public.current_profile_id() or public.is_super_admin());

drop policy if exists "prime_billing_periods_super_admin_manage" on public.prime_billing_periods;
create policy "prime_billing_periods_super_admin_manage"
on public.prime_billing_periods for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

comment on table public.prime_billing_periods is
  'Idempotent PRIME invoice ledger. It separates the Membership fee from the Wallet recharge credited for each paid Stripe period.';
