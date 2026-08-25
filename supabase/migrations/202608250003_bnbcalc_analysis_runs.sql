-- Durable BNBCalc request log and idempotency guard.
-- No existing lead or financial estimate data is modified by this migration.
create table if not exists bnbcalc_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  owner_request_id uuid not null references owner_requests(id) on delete cascade,
  requested_by_profile_id uuid references profiles(id) on delete set null,
  request_key uuid not null unique,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  full_address text not null,
  bedrooms numeric(6,2) not null check (bedrooms >= 0),
  bathrooms numeric(6,2) not null check (bathrooms >= 0),
  accommodates integer not null check (accommodates between 1 and 100),
  requested_currency text not null default 'EUR',
  source_currency text,
  source_adr numeric(12,4),
  eur_conversion_rate numeric(16,8),
  exchange_rate_date date,
  adr_eur numeric(12,2),
  occupancy_percentage numeric(7,4),
  bnbcalc_analysis_id text,
  bnbcalc_report_url text,
  error_message text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bnbcalc_analysis_runs_owner_request_idx
  on bnbcalc_analysis_runs (owner_request_id, created_at desc);

drop trigger if exists bnbcalc_analysis_runs_updated_at on bnbcalc_analysis_runs;
create trigger bnbcalc_analysis_runs_updated_at
before update on bnbcalc_analysis_runs
for each row execute function set_updated_at();

alter table bnbcalc_analysis_runs enable row level security;

drop policy if exists "bnbcalc_analysis_runs_super_admin_access" on bnbcalc_analysis_runs;
create policy "bnbcalc_analysis_runs_super_admin_access"
on bnbcalc_analysis_runs for all
to authenticated
using (is_super_admin())
with check (is_super_admin());
