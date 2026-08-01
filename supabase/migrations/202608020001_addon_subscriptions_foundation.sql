-- Paid addons foundation.
-- Addon subscriptions and payments are intentionally isolated from the Wallet.

create table if not exists addon_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  short_description text,
  description text,
  status text not null default 'draft',
  is_menu_visible boolean not null default false,
  checkout_enabled boolean not null default false,
  trial_days integer not null default 0,
  list_price_cents integer,
  sale_price_cents integer,
  currency text not null default 'eur',
  billing_interval text not null default 'month',
  billing_interval_count integer not null default 1,
  grace_period_days integer not null default 3,
  cancellation_mode text not null default 'period_end',
  stripe_product_id text,
  stripe_price_id text,
  cover_image_url text,
  video_url text,
  features jsonb not null default '[]'::jsonb,
  terms_url text not null default '/termini',
  display_order integer not null default 0,
  created_by uuid references profiles(id) on delete set null,
  updated_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint addon_products_slug_format
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint addon_products_name_length
    check (char_length(btrim(name)) between 2 and 120),
  constraint addon_products_status_valid
    check (status in ('draft', 'active', 'inactive')),
  constraint addon_products_trial_days_valid
    check (trial_days between 0 and 365),
  constraint addon_products_prices_valid
    check (
      (list_price_cents is null or list_price_cents >= 0)
      and (sale_price_cents is null or sale_price_cents > 0)
      and (
        list_price_cents is null
        or sale_price_cents is null
        or list_price_cents >= sale_price_cents
      )
    ),
  constraint addon_products_currency_format
    check (currency ~ '^[a-z]{3}$'),
  constraint addon_products_billing_interval_valid
    check (billing_interval in ('month', 'year')),
  constraint addon_products_billing_interval_count_valid
    check (billing_interval_count between 1 and 12),
  constraint addon_products_grace_period_valid
    check (grace_period_days between 0 and 30),
  constraint addon_products_cancellation_mode_valid
    check (cancellation_mode in ('period_end', 'immediate')),
  constraint addon_products_features_array
    check (jsonb_typeof(features) = 'array')
);

create unique index if not exists addon_products_stripe_product_unique_idx
  on addon_products (stripe_product_id)
  where stripe_product_id is not null;

create unique index if not exists addon_products_stripe_price_unique_idx
  on addon_products (stripe_price_id)
  where stripe_price_id is not null;

create index if not exists addon_products_visibility_idx
  on addon_products (status, is_menu_visible, display_order);

create table if not exists addon_subscriptions (
  id uuid primary key default gen_random_uuid(),
  addon_product_id uuid not null references addon_products(id) on delete restrict,
  profile_id uuid not null references profiles(id) on delete restrict,
  status text not null default 'incomplete',
  source text not null default 'stripe',
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_started_at timestamptz,
  current_period_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  access_expires_at timestamptz,
  manual_reason text,
  granted_by uuid references profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint addon_subscriptions_status_valid
    check (status in (
      'incomplete',
      'trialing',
      'active',
      'past_due',
      'paused',
      'unpaid',
      'canceled',
      'expired'
    )),
  constraint addon_subscriptions_source_valid
    check (source in ('stripe', 'manual')),
  constraint addon_subscriptions_trial_range_valid
    check (
      trial_started_at is null
      or trial_ends_at is null
      or trial_ends_at > trial_started_at
    ),
  constraint addon_subscriptions_period_range_valid
    check (
      current_period_started_at is null
      or current_period_ends_at is null
      or current_period_ends_at > current_period_started_at
    ),
  constraint addon_subscriptions_manual_reason_length
    check (manual_reason is null or char_length(manual_reason) <= 1000)
);

create unique index if not exists addon_subscriptions_stripe_subscription_unique_idx
  on addon_subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

create unique index if not exists addon_subscriptions_one_current_per_profile_idx
  on addon_subscriptions (addon_product_id, profile_id)
  where status in ('incomplete', 'trialing', 'active', 'past_due', 'paused', 'unpaid');

create index if not exists addon_subscriptions_profile_status_idx
  on addon_subscriptions (profile_id, status, updated_at desc);

create index if not exists addon_subscriptions_product_status_idx
  on addon_subscriptions (addon_product_id, status, updated_at desc);

create table if not exists addon_trial_usage (
  id uuid primary key default gen_random_uuid(),
  addon_product_id uuid not null references addon_products(id) on delete restrict,
  profile_id uuid not null references profiles(id) on delete restrict,
  subscription_id uuid references addon_subscriptions(id) on delete set null,
  source text not null default 'stripe',
  used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (addon_product_id, profile_id),
  constraint addon_trial_usage_source_valid
    check (source in ('stripe', 'manual'))
);

create index if not exists addon_trial_usage_profile_idx
  on addon_trial_usage (profile_id, used_at desc);

create table if not exists addon_payments (
  id uuid primary key default gen_random_uuid(),
  addon_product_id uuid not null references addon_products(id) on delete restrict,
  subscription_id uuid references addon_subscriptions(id) on delete set null,
  profile_id uuid not null references profiles(id) on delete restrict,
  payment_kind text not null default 'renewal',
  provider text not null default 'stripe',
  provider_invoice_id text,
  provider_payment_intent_id text,
  provider_checkout_session_id text,
  amount_cents integer not null,
  refunded_amount_cents integer not null default 0,
  currency text not null default 'eur',
  status text not null default 'pending',
  billing_period_started_at timestamptz,
  billing_period_ends_at timestamptz,
  paid_at timestamptz,
  refunded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint addon_payments_kind_valid
    check (payment_kind in ('initial', 'renewal', 'adjustment')),
  constraint addon_payments_amount_valid
    check (amount_cents >= 0),
  constraint addon_payments_refund_valid
    check (
      refunded_amount_cents >= 0
      and refunded_amount_cents <= amount_cents
    ),
  constraint addon_payments_currency_format
    check (currency ~ '^[a-z]{3}$'),
  constraint addon_payments_status_valid
    check (status in (
      'created',
      'pending',
      'paid',
      'failed',
      'refunded',
      'void',
      'uncollectible'
    )),
  constraint addon_payments_period_range_valid
    check (
      billing_period_started_at is null
      or billing_period_ends_at is null
      or billing_period_ends_at > billing_period_started_at
    )
);

create unique index if not exists addon_payments_provider_invoice_unique_idx
  on addon_payments (provider, provider_invoice_id)
  where provider_invoice_id is not null;

create unique index if not exists addon_payments_provider_intent_unique_idx
  on addon_payments (provider, provider_payment_intent_id)
  where provider_payment_intent_id is not null;

create index if not exists addon_payments_profile_created_idx
  on addon_payments (profile_id, created_at desc);

create index if not exists addon_payments_product_status_idx
  on addon_payments (addon_product_id, status, created_at desc);

create table if not exists addon_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'stripe',
  provider_event_id text not null,
  event_type text not null,
  status text not null default 'received',
  payload jsonb not null,
  attempts integer not null default 0,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (provider, provider_event_id),
  constraint addon_webhook_events_status_valid
    check (status in ('received', 'processing', 'processed', 'failed', 'ignored')),
  constraint addon_webhook_events_attempts_valid
    check (attempts >= 0)
);

create index if not exists addon_webhook_events_processing_idx
  on addon_webhook_events (status, received_at)
  where status in ('received', 'failed');

create table if not exists addon_access_events (
  id uuid primary key default gen_random_uuid(),
  addon_product_id uuid not null references addon_products(id) on delete restrict,
  subscription_id uuid references addon_subscriptions(id) on delete set null,
  profile_id uuid not null references profiles(id) on delete restrict,
  actor_profile_id uuid references profiles(id) on delete set null,
  action text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint addon_access_events_action_length
    check (char_length(btrim(action)) between 2 and 100),
  constraint addon_access_events_reason_length
    check (reason is null or char_length(reason) <= 1000)
);

create index if not exists addon_access_events_profile_created_idx
  on addon_access_events (profile_id, created_at desc);

create index if not exists addon_access_events_product_created_idx
  on addon_access_events (addon_product_id, created_at desc);

drop trigger if exists addon_products_updated_at on addon_products;
create trigger addon_products_updated_at
before update on addon_products
for each row execute function set_updated_at();

drop trigger if exists addon_subscriptions_updated_at on addon_subscriptions;
create trigger addon_subscriptions_updated_at
before update on addon_subscriptions
for each row execute function set_updated_at();

drop trigger if exists addon_payments_updated_at on addon_payments;
create trigger addon_payments_updated_at
before update on addon_payments
for each row execute function set_updated_at();

drop trigger if exists addon_webhook_events_updated_at on addon_webhook_events;
create trigger addon_webhook_events_updated_at
before update on addon_webhook_events
for each row execute function set_updated_at();

alter table addon_products enable row level security;
alter table addon_subscriptions enable row level security;
alter table addon_trial_usage enable row level security;
alter table addon_payments enable row level security;
alter table addon_webhook_events enable row level security;
alter table addon_access_events enable row level security;

drop policy if exists "addon_products_authenticated_read" on addon_products;
create policy "addon_products_authenticated_read"
on addon_products for select
to authenticated
using (
  is_super_admin()
  or (status = 'active' and is_menu_visible)
);

drop policy if exists "addon_products_super_admin_manage" on addon_products;
create policy "addon_products_super_admin_manage"
on addon_products for all
to authenticated
using (is_super_admin())
with check (is_super_admin());

drop policy if exists "addon_subscriptions_owner_read" on addon_subscriptions;
create policy "addon_subscriptions_owner_read"
on addon_subscriptions for select
to authenticated
using (profile_id = current_profile_id() or is_super_admin());

drop policy if exists "addon_subscriptions_super_admin_manage" on addon_subscriptions;
create policy "addon_subscriptions_super_admin_manage"
on addon_subscriptions for all
to authenticated
using (is_super_admin())
with check (is_super_admin());

drop policy if exists "addon_trial_usage_owner_read" on addon_trial_usage;
create policy "addon_trial_usage_owner_read"
on addon_trial_usage for select
to authenticated
using (profile_id = current_profile_id() or is_super_admin());

drop policy if exists "addon_trial_usage_super_admin_manage" on addon_trial_usage;
create policy "addon_trial_usage_super_admin_manage"
on addon_trial_usage for all
to authenticated
using (is_super_admin())
with check (is_super_admin());

drop policy if exists "addon_payments_owner_read" on addon_payments;
create policy "addon_payments_owner_read"
on addon_payments for select
to authenticated
using (profile_id = current_profile_id() or is_super_admin());

drop policy if exists "addon_payments_super_admin_manage" on addon_payments;
create policy "addon_payments_super_admin_manage"
on addon_payments for all
to authenticated
using (is_super_admin())
with check (is_super_admin());

drop policy if exists "addon_webhook_events_super_admin_read" on addon_webhook_events;
create policy "addon_webhook_events_super_admin_read"
on addon_webhook_events for select
to authenticated
using (is_super_admin());

drop policy if exists "addon_access_events_owner_read" on addon_access_events;
create policy "addon_access_events_owner_read"
on addon_access_events for select
to authenticated
using (profile_id = current_profile_id() or is_super_admin());

drop policy if exists "addon_access_events_super_admin_manage" on addon_access_events;
create policy "addon_access_events_super_admin_manage"
on addon_access_events for all
to authenticated
using (is_super_admin())
with check (is_super_admin());

insert into addon_products (
  slug,
  name,
  short_description,
  status,
  is_menu_visible,
  checkout_enabled,
  display_order
)
values (
  'marketing',
  'Modulo Marketing',
  'CRM e Rendita Stimata per Property Manager.',
  'draft',
  false,
  false,
  10
)
on conflict (slug) do nothing;
