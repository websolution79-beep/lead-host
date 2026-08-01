-- Default branding and economic assumptions for Marketing / Rendita Stimata.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'marketing-revenue-branding',
  'marketing-revenue-branding',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table if not exists marketing_revenue_templates (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles(id) on delete cascade,
  report_title text not null default 'Relazione Incassi Stimati',
  brand_name text,
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
  disclaimer text not null default 'Questa analisi rappresenta una stima previsionale basata sui parametri inseriti e sui dati di mercato disponibili. I risultati effettivi possono variare in funzione di stagionalità, andamento della domanda e dinamiche competitive. Le valutazioni fiscali sono indicative e devono essere verificate con il proprio consulente.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_revenue_template_days_available check (days_available between 1 and 366),
  constraint marketing_revenue_template_mix_total check (abs((airbnb_mix_rate + booking_mix_rate + direct_mix_rate) - 1) < 0.0001),
  constraint marketing_revenue_template_rates check (
    pm_fee_rate between 0 and 1 and airbnb_mix_rate between 0 and 1 and booking_mix_rate between 0 and 1 and direct_mix_rate between 0 and 1
    and airbnb_commission_rate between 0 and 1 and booking_commission_rate between 0 and 1 and direct_commission_rate between 0 and 1
    and ota_vat_rate between 0 and 1 and pm_vat_rate between 0 and 1 and tax_rate between 0 and 1
  )
);

drop trigger if exists marketing_revenue_templates_updated_at on marketing_revenue_templates;
create trigger marketing_revenue_templates_updated_at
before update on marketing_revenue_templates
for each row execute function set_updated_at();

alter table marketing_revenue_templates enable row level security;

drop policy if exists "marketing_revenue_templates_owner_access" on marketing_revenue_templates;
create policy "marketing_revenue_templates_owner_access"
on marketing_revenue_templates for all
to authenticated
using (profile_id = current_profile_id() or is_super_admin())
with check (profile_id = current_profile_id() or is_super_admin());

drop policy if exists "marketing_revenue_branding_super_admin_storage_access" on storage.objects;
create policy "marketing_revenue_branding_super_admin_storage_access"
on storage.objects for all
to authenticated
using (bucket_id = 'marketing-revenue-branding' and is_super_admin())
with check (bucket_id = 'marketing-revenue-branding' and is_super_admin());
