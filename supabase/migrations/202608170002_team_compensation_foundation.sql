create table if not exists public.team_compensation_settings (
  id boolean primary key default true,
  feature_enabled boolean not null default false,
  lead_verification_cents integer not null default 300,
  prime_first_activation_cents integer not null default 5000,
  prime_renewal_cents integer not null default 2000,
  prime_lead_purchase_basis_points integer not null default 1000,
  currency text not null default 'EUR',
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_compensation_settings_singleton check (id = true),
  constraint team_compensation_settings_lead_rate check (lead_verification_cents >= 0),
  constraint team_compensation_settings_activation_rate check (prime_first_activation_cents >= 0),
  constraint team_compensation_settings_renewal_rate check (prime_renewal_cents >= 0),
  constraint team_compensation_settings_purchase_rate check (
    prime_lead_purchase_basis_points between 0 and 10000
  ),
  constraint team_compensation_settings_currency check (currency = 'EUR')
);

insert into public.team_compensation_settings (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.team_member_compensation_rules (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique references public.team_members(id) on delete cascade,
  lead_verification_enabled boolean not null default true,
  prime_first_activation_enabled boolean not null default false,
  prime_renewal_enabled boolean not null default false,
  prime_lead_purchase_enabled boolean not null default false,
  lead_verification_cents_override integer,
  prime_first_activation_cents_override integer,
  prime_renewal_cents_override integer,
  prime_lead_purchase_basis_points_override integer,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_member_compensation_lead_override check (
    lead_verification_cents_override is null or lead_verification_cents_override >= 0
  ),
  constraint team_member_compensation_activation_override check (
    prime_first_activation_cents_override is null or prime_first_activation_cents_override >= 0
  ),
  constraint team_member_compensation_renewal_override check (
    prime_renewal_cents_override is null or prime_renewal_cents_override >= 0
  ),
  constraint team_member_compensation_purchase_override check (
    prime_lead_purchase_basis_points_override is null
    or prime_lead_purchase_basis_points_override between 0 and 10000
  )
);

create table if not exists public.team_compensation_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.team_members(id) on delete restrict,
  event_type text not null,
  status text not null default 'accrued',
  source_type text not null,
  source_id text not null,
  source_event_key text not null unique,
  owner_request_id uuid references public.owner_requests(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  property_manager_profile_id uuid references public.profiles(id) on delete set null,
  amount_cents integer not null,
  base_amount_cents integer,
  fixed_rate_cents integer,
  rate_basis_points integer,
  currency text not null default 'EUR',
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  accrued_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references public.profiles(id) on delete set null,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_compensation_events_type check (
    event_type in (
      'lead_verification',
      'prime_first_activation',
      'prime_renewal',
      'prime_lead_purchase',
      'refund_adjustment',
      'manual_adjustment'
    )
  ),
  constraint team_compensation_events_status check (
    status in ('pending_attribution', 'accrued', 'voided')
  ),
  constraint team_compensation_events_member_status check (
    (status = 'pending_attribution' and member_id is null)
    or (status in ('accrued', 'voided') and member_id is not null)
  ),
  constraint team_compensation_events_amount check (amount_cents <> 0),
  constraint team_compensation_events_base_amount check (
    base_amount_cents is null or base_amount_cents >= 0
  ),
  constraint team_compensation_events_fixed_rate check (
    fixed_rate_cents is null or fixed_rate_cents >= 0
  ),
  constraint team_compensation_events_percentage check (
    rate_basis_points is null or rate_basis_points between 0 and 10000
  ),
  constraint team_compensation_events_currency check (currency = 'EUR'),
  constraint team_compensation_events_void_data check (
    (status <> 'voided' and voided_at is null and voided_by is null and void_reason is null)
    or (status = 'voided' and voided_at is not null and void_reason is not null)
  )
);

create table if not exists public.team_lead_verification_claims (
  id uuid primary key default gen_random_uuid(),
  owner_request_id uuid not null unique references public.owner_requests(id) on delete restrict,
  member_id uuid not null references public.team_members(id) on delete restrict,
  compensation_event_id uuid not null unique references public.team_compensation_events(id) on delete restrict,
  status text not null default 'confirmed',
  confirmed_at timestamptz not null default now(),
  confirmed_by uuid not null references public.profiles(id) on delete restrict,
  voided_at timestamptz,
  voided_by uuid references public.profiles(id) on delete set null,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_lead_verification_claims_status check (
    status in ('confirmed', 'voided')
  ),
  constraint team_lead_verification_claims_void_data check (
    (status = 'confirmed' and voided_at is null and voided_by is null and void_reason is null)
    or (status = 'voided' and voided_at is not null and void_reason is not null)
  )
);

create table if not exists public.team_compensation_payouts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.team_members(id) on delete restrict,
  status text not null default 'completed',
  amount_cents integer not null,
  currency text not null default 'EUR',
  payment_method text not null,
  payment_reference text,
  notes text,
  paid_at timestamptz not null,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  voided_at timestamptz,
  voided_by uuid references public.profiles(id) on delete set null,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_compensation_payouts_status check (
    status in ('completed', 'voided')
  ),
  constraint team_compensation_payouts_amount check (amount_cents > 0),
  constraint team_compensation_payouts_currency check (currency = 'EUR'),
  constraint team_compensation_payouts_method check (
    payment_method in ('paypal', 'bank_transfer', 'cash', 'other')
  ),
  constraint team_compensation_payouts_void_data check (
    (status = 'completed' and voided_at is null and voided_by is null and void_reason is null)
    or (status = 'voided' and voided_at is not null and void_reason is not null)
  )
);

create table if not exists public.team_compensation_payout_allocations (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.team_compensation_payouts(id) on delete restrict,
  compensation_event_id uuid not null references public.team_compensation_events(id) on delete restrict,
  amount_cents integer not null,
  created_at timestamptz not null default now(),
  constraint team_compensation_payout_allocations_unique unique (
    payout_id,
    compensation_event_id
  ),
  constraint team_compensation_payout_allocations_amount check (amount_cents > 0)
);

create table if not exists public.team_compensation_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  source_type text not null,
  source_id text not null,
  source_event_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_compensation_outbox_status check (
    status in ('pending', 'processing', 'completed', 'failed')
  ),
  constraint team_compensation_outbox_attempts check (attempts >= 0)
);

create table if not exists public.team_compensation_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text not null,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists team_compensation_events_member_occurred_idx
  on public.team_compensation_events (member_id, occurred_at desc)
  where status <> 'voided';
create index if not exists team_compensation_events_status_occurred_idx
  on public.team_compensation_events (status, occurred_at desc);
create index if not exists team_compensation_events_pm_idx
  on public.team_compensation_events (property_manager_profile_id, occurred_at desc)
  where property_manager_profile_id is not null;
create index if not exists team_compensation_events_lead_idx
  on public.team_compensation_events (lead_id)
  where lead_id is not null;
create index if not exists team_compensation_payouts_member_paid_idx
  on public.team_compensation_payouts (member_id, paid_at desc)
  where status = 'completed';
create index if not exists team_compensation_allocations_event_idx
  on public.team_compensation_payout_allocations (compensation_event_id);
create index if not exists team_compensation_outbox_pending_idx
  on public.team_compensation_outbox (status, available_at, created_at)
  where status in ('pending', 'failed');
create index if not exists team_compensation_audit_target_idx
  on public.team_compensation_audit_logs (target_type, target_id, created_at desc);

drop trigger if exists team_compensation_settings_updated_at on public.team_compensation_settings;
create trigger team_compensation_settings_updated_at
before update on public.team_compensation_settings
for each row execute function public.set_updated_at();

drop trigger if exists team_member_compensation_rules_updated_at on public.team_member_compensation_rules;
create trigger team_member_compensation_rules_updated_at
before update on public.team_member_compensation_rules
for each row execute function public.set_updated_at();

drop trigger if exists team_compensation_events_updated_at on public.team_compensation_events;
create trigger team_compensation_events_updated_at
before update on public.team_compensation_events
for each row execute function public.set_updated_at();

drop trigger if exists team_lead_verification_claims_updated_at on public.team_lead_verification_claims;
create trigger team_lead_verification_claims_updated_at
before update on public.team_lead_verification_claims
for each row execute function public.set_updated_at();

drop trigger if exists team_compensation_payouts_updated_at on public.team_compensation_payouts;
create trigger team_compensation_payouts_updated_at
before update on public.team_compensation_payouts
for each row execute function public.set_updated_at();

drop trigger if exists team_compensation_outbox_updated_at on public.team_compensation_outbox;
create trigger team_compensation_outbox_updated_at
before update on public.team_compensation_outbox
for each row execute function public.set_updated_at();

alter table public.team_compensation_settings enable row level security;
alter table public.team_member_compensation_rules enable row level security;
alter table public.team_compensation_events enable row level security;
alter table public.team_lead_verification_claims enable row level security;
alter table public.team_compensation_payouts enable row level security;
alter table public.team_compensation_payout_allocations enable row level security;
alter table public.team_compensation_outbox enable row level security;
alter table public.team_compensation_audit_logs enable row level security;

revoke all on table public.team_compensation_settings from anon, authenticated;
revoke all on table public.team_member_compensation_rules from anon, authenticated;
revoke all on table public.team_compensation_events from anon, authenticated;
revoke all on table public.team_lead_verification_claims from anon, authenticated;
revoke all on table public.team_compensation_payouts from anon, authenticated;
revoke all on table public.team_compensation_payout_allocations from anon, authenticated;
revoke all on table public.team_compensation_outbox from anon, authenticated;
revoke all on table public.team_compensation_audit_logs from anon, authenticated;

grant all on table public.team_compensation_settings to service_role;
grant all on table public.team_member_compensation_rules to service_role;
grant all on table public.team_compensation_events to service_role;
grant all on table public.team_lead_verification_claims to service_role;
grant all on table public.team_compensation_payouts to service_role;
grant all on table public.team_compensation_payout_allocations to service_role;
grant all on table public.team_compensation_outbox to service_role;
grant all on table public.team_compensation_audit_logs to service_role;

comment on table public.team_compensation_settings is
  'Configurazione globale e feature flag del motore compensi Team.';
comment on table public.team_member_compensation_rules is
  'Abilitazioni e tariffe personalizzate per singolo membro Team.';
comment on table public.team_compensation_events is
  'Registro append-only dei compensi maturati, da attribuire o annullati.';
comment on table public.team_lead_verification_claims is
  'Conferme manuali univoche della verifica lead ai fini del compenso.';
comment on table public.team_compensation_payouts is
  'Liquidazioni manuali registrate dal Super Admin.';
comment on table public.team_compensation_payout_allocations is
  'Ripartizione delle liquidazioni sulle singole voci di compenso.';
comment on table public.team_compensation_outbox is
  'Coda idempotente e ritentabile per eventi economici non bloccanti.';
comment on table public.team_compensation_audit_logs is
  'Audit amministrativo delle modifiche al sistema compensi.';
