-- Saved single-scenario revenue estimates. Inputs and outputs are frozen per estimate
-- so future template edits never change a historical evaluation.

create table if not exists marketing_revenue_estimates (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  crm_contact_id uuid references marketing_crm_contacts(id) on delete set null,
  owner_name text,
  property_address text,
  city text,
  property_type text,
  calculation_mode text not null default 'adr_occupancy',
  adr_per_night numeric(12,2),
  occupancy_rate numeric(7,4),
  days_available integer not null default 365,
  annual_gross_revenue_input numeric(14,2),
  pm_fee_rate numeric(7,4) not null default 0.2000,
  airbnb_mix_rate numeric(7,4) not null default 0.7000,
  booking_mix_rate numeric(7,4) not null default 0.3000,
  direct_mix_rate numeric(7,4) not null default 0.0000,
  airbnb_commission_rate numeric(7,4) not null default 0.1500,
  booking_commission_rate numeric(7,4) not null default 0.1800,
  direct_commission_rate numeric(7,4) not null default 0.0000,
  ota_vat_rate numeric(7,4) not null default 0.2200,
  pm_vat_rate numeric(7,4) not null default 0.0000,
  tax_rate numeric(7,4) not null default 0.0000,
  ota_cost_label text not null,
  management_cost_label text not null,
  tax_cost_label text not null,
  report_title text not null,
  brand_name text,
  header_text text,
  contact_details text,
  logo_path text,
  disclaimer text not null,
  effective_ota_rate numeric(7,4) not null,
  gross_annual_revenue numeric(14,2) not null,
  ota_commission_net numeric(14,2) not null,
  ota_commission_gross numeric(14,2) not null,
  pm_fee_base numeric(14,2) not null,
  pm_fee_net numeric(14,2) not null,
  pm_fee_gross numeric(14,2) not null,
  owner_pre_tax numeric(14,2) not null,
  tax_amount numeric(14,2) not null,
  owner_annual_net numeric(14,2) not null,
  owner_monthly_net numeric(14,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_revenue_estimates_calculation_mode check (calculation_mode in ('adr_occupancy', 'annual_revenue')),
  constraint marketing_revenue_estimates_days check (days_available between 1 and 366),
  constraint marketing_revenue_estimates_mix_total check (abs((airbnb_mix_rate + booking_mix_rate + direct_mix_rate) - 1) < 0.0001),
  constraint marketing_revenue_estimates_rates check (
    occupancy_rate is null or occupancy_rate between 0 and 1
    and pm_fee_rate between 0 and 1 and airbnb_mix_rate between 0 and 1 and booking_mix_rate between 0 and 1 and direct_mix_rate between 0 and 1
    and airbnb_commission_rate between 0 and 1 and booking_commission_rate between 0 and 1 and direct_commission_rate between 0 and 1
    and ota_vat_rate between 0 and 1 and pm_vat_rate between 0 and 1 and tax_rate between 0 and 1
  ),
  constraint marketing_revenue_estimates_input_by_mode check (
    (calculation_mode = 'adr_occupancy' and adr_per_night is not null and occupancy_rate is not null)
    or (calculation_mode = 'annual_revenue' and annual_gross_revenue_input is not null)
  )
);

create index if not exists marketing_revenue_estimates_profile_updated_idx
  on marketing_revenue_estimates (profile_id, updated_at desc);

create index if not exists marketing_revenue_estimates_contact_idx
  on marketing_revenue_estimates (crm_contact_id, updated_at desc)
  where crm_contact_id is not null;

drop trigger if exists marketing_revenue_estimates_updated_at on marketing_revenue_estimates;
create trigger marketing_revenue_estimates_updated_at
before update on marketing_revenue_estimates
for each row execute function set_updated_at();

alter table marketing_revenue_estimates enable row level security;

drop policy if exists "marketing_revenue_estimates_owner_access" on marketing_revenue_estimates;
create policy "marketing_revenue_estimates_owner_access"
on marketing_revenue_estimates for all
to authenticated
using (profile_id = current_profile_id() or is_super_admin())
with check (profile_id = current_profile_id() or is_super_admin());
