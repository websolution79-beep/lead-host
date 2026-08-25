-- Marketplace financial estimate foundation.
-- This is deliberately separate from the Marketing add-on revenue estimate data:
-- the template belongs to Lead Host and every lead retains an immutable economic
-- snapshot that can be safely shown to eligible Marketplace visitors later.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'marketplace-financial-branding',
  'marketplace-financial-branding',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- One Lead Host-owned model. A text primary key makes the intended singleton
-- explicit while leaving room for a future named model without a schema rewrite.
create table if not exists marketplace_financial_templates (
  key text primary key default 'default' check (key = 'default'),
  report_title text not null default 'Stima di rendita potenziale',
  brand_name text not null default 'Lead Host',
  header_text text,
  contact_details text,
  logo_path text,
  days_available integer not null default 365,
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
  ota_cost_label text not null default 'Commissioni OTA incl. IVA',
  management_cost_label text not null default 'Gestione Property Manager incl. IVA',
  tax_cost_label text not null default 'Imposte',
  disclaimer text not null default 'Questa stima ha finalita esclusivamente informative e si basa sui parametri inseriti e sui dati di mercato disponibili. I risultati effettivi possono variare in funzione di stagionalita, domanda, costi operativi e dinamiche competitive. Le valutazioni fiscali sono indicative e devono essere verificate con il proprio consulente.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_financial_template_days_available check (days_available between 1 and 366),
  constraint marketplace_financial_template_mix_total check (
    abs((airbnb_mix_rate + booking_mix_rate + direct_mix_rate) - 1) < 0.0001
  ),
  constraint marketplace_financial_template_rates check (
    pm_fee_rate between 0 and 1
    and airbnb_mix_rate between 0 and 1
    and booking_mix_rate between 0 and 1
    and direct_mix_rate between 0 and 1
    and airbnb_commission_rate between 0 and 1
    and booking_commission_rate between 0 and 1
    and direct_commission_rate between 0 and 1
    and ota_vat_rate between 0 and 1
    and pm_vat_rate between 0 and 1
    and tax_rate between 0 and 1
  )
);

insert into marketplace_financial_templates (key)
values ('default')
on conflict (key) do nothing;

drop trigger if exists marketplace_financial_templates_updated_at on marketplace_financial_templates;
create trigger marketplace_financial_templates_updated_at
before update on marketplace_financial_templates
for each row execute function set_updated_at();

-- The economic inputs and outputs are copied onto the lead estimate. Updating the
-- default model therefore never changes an estimate already prepared for a lead.
create table if not exists marketplace_financial_estimates (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references leads(id) on delete cascade,
  is_visible boolean not null default false,
  adr_per_night numeric(12,2) not null,
  occupancy_rate numeric(7,4) not null,
  days_available integer not null default 365,
  pm_fee_rate numeric(7,4) not null,
  airbnb_mix_rate numeric(7,4) not null,
  booking_mix_rate numeric(7,4) not null,
  direct_mix_rate numeric(7,4) not null,
  airbnb_commission_rate numeric(7,4) not null,
  booking_commission_rate numeric(7,4) not null,
  direct_commission_rate numeric(7,4) not null,
  ota_vat_rate numeric(7,4) not null,
  pm_vat_rate numeric(7,4) not null,
  tax_rate numeric(7,4) not null,
  ota_cost_label text not null,
  management_cost_label text not null,
  tax_cost_label text not null,
  report_title text not null,
  brand_name text not null,
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
  created_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_financial_estimates_adr check (adr_per_night >= 0),
  constraint marketplace_financial_estimates_days check (days_available between 1 and 366),
  constraint marketplace_financial_estimates_occupancy check (occupancy_rate between 0 and 1),
  constraint marketplace_financial_estimates_mix_total check (
    abs((airbnb_mix_rate + booking_mix_rate + direct_mix_rate) - 1) < 0.0001
  ),
  constraint marketplace_financial_estimates_rates check (
    pm_fee_rate between 0 and 1
    and airbnb_mix_rate between 0 and 1
    and booking_mix_rate between 0 and 1
    and direct_mix_rate between 0 and 1
    and airbnb_commission_rate between 0 and 1
    and booking_commission_rate between 0 and 1
    and direct_commission_rate between 0 and 1
    and ota_vat_rate between 0 and 1
    and pm_vat_rate between 0 and 1
    and tax_rate between 0 and 1
  )
);

create index if not exists marketplace_financial_estimates_visible_idx
  on marketplace_financial_estimates (lead_id)
  where is_visible = true;

drop trigger if exists marketplace_financial_estimates_updated_at on marketplace_financial_estimates;
create trigger marketplace_financial_estimates_updated_at
before update on marketplace_financial_estimates
for each row execute function set_updated_at();

alter table marketplace_financial_templates enable row level security;
alter table marketplace_financial_estimates enable row level security;

drop policy if exists "marketplace_financial_templates_super_admin_access" on marketplace_financial_templates;
create policy "marketplace_financial_templates_super_admin_access"
on marketplace_financial_templates for all
to authenticated
using (is_super_admin())
with check (is_super_admin());

drop policy if exists "marketplace_financial_estimates_super_admin_access" on marketplace_financial_estimates;
create policy "marketplace_financial_estimates_super_admin_access"
on marketplace_financial_estimates for all
to authenticated
using (is_super_admin())
with check (is_super_admin());

drop policy if exists "marketplace_financial_branding_super_admin_storage_access" on storage.objects;
create policy "marketplace_financial_branding_super_admin_storage_access"
on storage.objects for all
to authenticated
using (bucket_id = 'marketplace-financial-branding' and is_super_admin())
with check (bucket_id = 'marketplace-financial-branding' and is_super_admin());
