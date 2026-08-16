-- Lead Host PRIME foundation.
-- This migration is intentionally inert: PRIME remains hidden and checkout-disabled
-- until the following application phases are completed and explicitly enabled.

insert into public.addon_products (
  slug,
  name,
  short_description,
  description,
  status,
  is_menu_visible,
  checkout_enabled,
  trial_days,
  grace_period_days,
  cancellation_mode,
  display_order,
  features
)
values (
  'lead-host-prime',
  'Lead Host PRIME',
  'Accesso riservato alla Prime Zone e ai vantaggi dedicati ai Property Manager selezionati.',
  'Servizio premium su invito con accesso aggiuntivo alla Prime Zone. Il Marketplace pubblico resta sempre disponibile.',
  'draft',
  false,
  false,
  0,
  3,
  'period_end',
  20,
  '["Prime Zone riservata","Opportunita assegnate in anteprima","Accesso aggiuntivo al Marketplace pubblico"]'::jsonb
)
on conflict (slug) do nothing;

create table if not exists public.prime_eligibilities (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete restrict,
  is_enabled boolean not null default false,
  enabled_at timestamptz,
  enabled_by uuid references public.profiles(id) on delete set null,
  disabled_at timestamptz,
  disabled_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prime_eligibilities_notes_length
    check (notes is null or char_length(notes) <= 1000),
  constraint prime_eligibilities_enabled_metadata
    check (not is_enabled or enabled_at is not null)
);

create index if not exists prime_eligibilities_enabled_idx
  on public.prime_eligibilities (is_enabled, updated_at desc);

create table if not exists public.prime_accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete restrict,
  addon_product_id uuid not null references public.addon_products(id) on delete restrict,
  addon_subscription_id uuid unique references public.addon_subscriptions(id) on delete set null,
  account_manager_member_id uuid references public.team_members(id) on delete set null,
  status text not null default 'inactive',
  access_source text not null default 'none',
  prime_started_at timestamptz,
  prime_expires_at timestamptz,
  last_activated_at timestamptz,
  last_renewed_at timestamptz,
  grace_ends_at timestamptz,
  payment_status text not null default 'not_applicable',
  admin_override_active boolean not null default false,
  admin_override_started_at timestamptz,
  admin_override_expires_at timestamptz,
  admin_override_reason text,
  admin_override_granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prime_accounts_status_valid
    check (status in ('inactive', 'active', 'past_due', 'suspended', 'cancelled')),
  constraint prime_accounts_access_source_valid
    check (access_source in ('none', 'stripe', 'manual')),
  constraint prime_accounts_payment_status_valid
    check (payment_status in (
      'not_applicable',
      'pending',
      'trialing',
      'paid',
      'past_due',
      'unpaid',
      'cancelled'
    )),
  constraint prime_accounts_period_valid
    check (
      prime_started_at is null
      or prime_expires_at is null
      or prime_expires_at > prime_started_at
    ),
  constraint prime_accounts_override_period_valid
    check (
      admin_override_started_at is null
      or admin_override_expires_at is null
      or admin_override_expires_at > admin_override_started_at
    ),
  constraint prime_accounts_override_reason_length
    check (
      admin_override_reason is null
      or char_length(admin_override_reason) <= 1000
    ),
  constraint prime_accounts_manual_override_consistency
    check (
      not admin_override_active
      or (
        access_source = 'manual'
        and admin_override_started_at is not null
      )
    )
);

create index if not exists prime_accounts_status_idx
  on public.prime_accounts (status, updated_at desc);

create index if not exists prime_accounts_manager_status_idx
  on public.prime_accounts (account_manager_member_id, status, updated_at desc);

create index if not exists prime_accounts_expiry_idx
  on public.prime_accounts (prime_expires_at)
  where status in ('active', 'past_due');

create table if not exists public.prime_account_events (
  id uuid primary key default gen_random_uuid(),
  prime_account_id uuid not null references public.prime_accounts(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  addon_subscription_id uuid references public.addon_subscriptions(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  from_status text,
  to_status text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint prime_account_events_type_length
    check (char_length(btrim(event_type)) between 2 and 100),
  constraint prime_account_events_from_status_valid
    check (
      from_status is null
      or from_status in ('inactive', 'active', 'past_due', 'suspended', 'cancelled')
    ),
  constraint prime_account_events_to_status_valid
    check (
      to_status is null
      or to_status in ('inactive', 'active', 'past_due', 'suspended', 'cancelled')
    ),
  constraint prime_account_events_reason_length
    check (reason is null or char_length(reason) <= 1000),
  constraint prime_account_events_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists prime_account_events_account_created_idx
  on public.prime_account_events (prime_account_id, created_at desc);

create index if not exists prime_account_events_profile_created_idx
  on public.prime_account_events (profile_id, created_at desc);

drop trigger if exists prime_eligibilities_updated_at on public.prime_eligibilities;
create trigger prime_eligibilities_updated_at
before update on public.prime_eligibilities
for each row execute function public.set_updated_at();

drop trigger if exists prime_accounts_updated_at on public.prime_accounts;
create trigger prime_accounts_updated_at
before update on public.prime_accounts
for each row execute function public.set_updated_at();

alter table public.prime_eligibilities enable row level security;
alter table public.prime_accounts enable row level security;
alter table public.prime_account_events enable row level security;

drop policy if exists "prime_eligibilities_owner_read" on public.prime_eligibilities;
create policy "prime_eligibilities_owner_read"
on public.prime_eligibilities for select
to authenticated
using (profile_id = current_profile_id() or is_super_admin());

drop policy if exists "prime_eligibilities_super_admin_manage" on public.prime_eligibilities;
create policy "prime_eligibilities_super_admin_manage"
on public.prime_eligibilities for all
to authenticated
using (is_super_admin())
with check (is_super_admin());

drop policy if exists "prime_accounts_owner_read" on public.prime_accounts;
create policy "prime_accounts_owner_read"
on public.prime_accounts for select
to authenticated
using (profile_id = current_profile_id() or is_super_admin());

drop policy if exists "prime_accounts_super_admin_manage" on public.prime_accounts;
create policy "prime_accounts_super_admin_manage"
on public.prime_accounts for all
to authenticated
using (is_super_admin())
with check (is_super_admin());

drop policy if exists "prime_account_events_owner_read" on public.prime_account_events;
create policy "prime_account_events_owner_read"
on public.prime_account_events for select
to authenticated
using (profile_id = current_profile_id() or is_super_admin());

drop policy if exists "prime_account_events_super_admin_manage" on public.prime_account_events;
create policy "prime_account_events_super_admin_manage"
on public.prime_account_events for all
to authenticated
using (is_super_admin())
with check (is_super_admin());

comment on table public.prime_eligibilities is
  'Commercial eligibility to view and purchase Lead Host PRIME. Eligibility does not grant PRIME access.';

comment on table public.prime_accounts is
  'Effective PRIME access state, linked to either Stripe subscription or explicit admin override.';

comment on table public.prime_account_events is
  'Append-only audit history for PRIME activation, renewals, status and portfolio assignment changes.';
