-- Standalone property management area for the Marketing addon.
-- It deliberately does not reference CRM contacts or revenue estimates.

create table if not exists marketing_managed_properties (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  property_type text,
  property_address text,
  region text,
  province text,
  city text,
  bedrooms integer,
  bathrooms integer,
  beds integer,
  area_sqm integer,
  owner_full_name text,
  owner_email text,
  owner_phone text,
  owner_notes text,
  operational_notes text,
  cover_image_path text,
  cover_image_name text,
  cover_image_content_type text,
  cover_image_byte_size integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_managed_properties_name_length check (char_length(btrim(name)) between 2 and 140),
  constraint marketing_managed_properties_type_length check (property_type is null or char_length(property_type) <= 80),
  constraint marketing_managed_properties_address_length check (property_address is null or char_length(property_address) <= 300),
  constraint marketing_managed_properties_region_length check (region is null or char_length(region) <= 100),
  constraint marketing_managed_properties_province_length check (province is null or char_length(province) <= 100),
  constraint marketing_managed_properties_city_length check (city is null or char_length(city) <= 120),
  constraint marketing_managed_properties_bedrooms_range check (bedrooms is null or bedrooms between 0 and 99),
  constraint marketing_managed_properties_bathrooms_range check (bathrooms is null or bathrooms between 0 and 99),
  constraint marketing_managed_properties_beds_range check (beds is null or beds between 0 and 99),
  constraint marketing_managed_properties_area_range check (area_sqm is null or area_sqm between 1 and 100000),
  constraint marketing_managed_properties_owner_name_length check (owner_full_name is null or char_length(owner_full_name) <= 140),
  constraint marketing_managed_properties_owner_email_length check (owner_email is null or char_length(owner_email) <= 255),
  constraint marketing_managed_properties_owner_phone_length check (owner_phone is null or char_length(owner_phone) <= 50),
  constraint marketing_managed_properties_owner_notes_length check (owner_notes is null or char_length(owner_notes) <= 5000),
  constraint marketing_managed_properties_operational_notes_length check (operational_notes is null or char_length(operational_notes) <= 5000),
  constraint marketing_managed_properties_cover_path_length check (cover_image_path is null or char_length(cover_image_path) <= 500),
  constraint marketing_managed_properties_cover_name_length check (cover_image_name is null or char_length(cover_image_name) <= 255),
  constraint marketing_managed_properties_cover_type check (cover_image_content_type is null or cover_image_content_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint marketing_managed_properties_cover_size check (cover_image_byte_size is null or cover_image_byte_size between 1 and 2097152)
);

create index if not exists marketing_managed_properties_profile_updated_idx
  on marketing_managed_properties (profile_id, updated_at desc);
create index if not exists marketing_managed_properties_profile_city_idx
  on marketing_managed_properties (profile_id, city);

create table if not exists marketing_managed_property_contacts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references marketing_managed_properties(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  service_type text not null,
  name text,
  company_name text,
  phone text,
  email text,
  whatsapp text,
  notes text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_managed_property_contacts_service_length check (char_length(btrim(service_type)) between 2 and 100),
  constraint marketing_managed_property_contacts_name_length check (name is null or char_length(name) <= 140),
  constraint marketing_managed_property_contacts_company_length check (company_name is null or char_length(company_name) <= 160),
  constraint marketing_managed_property_contacts_phone_length check (phone is null or char_length(phone) <= 50),
  constraint marketing_managed_property_contacts_email_length check (email is null or char_length(email) <= 255),
  constraint marketing_managed_property_contacts_whatsapp_length check (whatsapp is null or char_length(whatsapp) <= 50),
  constraint marketing_managed_property_contacts_notes_length check (notes is null or char_length(notes) <= 5000)
);

create index if not exists marketing_managed_property_contacts_property_position_idx
  on marketing_managed_property_contacts (property_id, position, created_at);

create table if not exists marketing_managed_property_ota_links (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references marketing_managed_properties(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  label text not null,
  url text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_managed_property_ota_links_label_length check (char_length(btrim(label)) between 2 and 80),
  constraint marketing_managed_property_ota_links_url_length check (char_length(btrim(url)) between 8 and 2048),
  constraint marketing_managed_property_ota_links_url_format check (url ~* '^https?://')
);

create index if not exists marketing_managed_property_ota_links_property_position_idx
  on marketing_managed_property_ota_links (property_id, position, created_at);

create table if not exists marketing_managed_property_maintenance (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references marketing_managed_properties(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  happened_at date not null default current_date,
  category text not null,
  title text not null,
  description text,
  supplier_name text,
  cost_cents integer,
  next_due_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_managed_property_maintenance_category_length check (char_length(btrim(category)) between 2 and 100),
  constraint marketing_managed_property_maintenance_title_length check (char_length(btrim(title)) between 2 and 180),
  constraint marketing_managed_property_maintenance_description_length check (description is null or char_length(description) <= 5000),
  constraint marketing_managed_property_maintenance_supplier_length check (supplier_name is null or char_length(supplier_name) <= 160),
  constraint marketing_managed_property_maintenance_cost_range check (cost_cents is null or cost_cents between 0 and 100000000)
);

create index if not exists marketing_managed_property_maintenance_property_date_idx
  on marketing_managed_property_maintenance (property_id, happened_at desc, created_at desc);

create table if not exists marketing_managed_property_documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references marketing_managed_properties(id) on delete cascade,
  maintenance_id uuid references marketing_managed_property_maintenance(id) on delete set null,
  profile_id uuid not null references profiles(id) on delete cascade,
  category text not null default 'other',
  storage_path text not null unique,
  original_name text not null,
  content_type text not null,
  byte_size integer not null,
  created_at timestamptz not null default now(),
  constraint marketing_managed_property_documents_category check (category in ('contract', 'floorplan', 'manual', 'maintenance', 'other')),
  constraint marketing_managed_property_documents_name_length check (char_length(btrim(original_name)) between 1 and 255),
  constraint marketing_managed_property_documents_path_length check (char_length(storage_path) between 1 and 500),
  constraint marketing_managed_property_documents_size_range check (byte_size between 1 and 10485760),
  constraint marketing_managed_property_documents_type check (content_type in ('application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
);

create index if not exists marketing_managed_property_documents_property_created_idx
  on marketing_managed_property_documents (property_id, created_at desc);

create or replace function validate_marketing_managed_property_child_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from marketing_managed_properties property
    where property.id = new.property_id and property.profile_id = new.profile_id
  ) then
    raise exception 'marketing_managed_property_profile_mismatch';
  end if;
  return new;
end;
$$;

drop trigger if exists marketing_managed_properties_updated_at on marketing_managed_properties;
create trigger marketing_managed_properties_updated_at before update on marketing_managed_properties
for each row execute function set_updated_at();
drop trigger if exists marketing_managed_property_contacts_updated_at on marketing_managed_property_contacts;
create trigger marketing_managed_property_contacts_updated_at before update on marketing_managed_property_contacts
for each row execute function set_updated_at();
drop trigger if exists marketing_managed_property_ota_links_updated_at on marketing_managed_property_ota_links;
create trigger marketing_managed_property_ota_links_updated_at before update on marketing_managed_property_ota_links
for each row execute function set_updated_at();
drop trigger if exists marketing_managed_property_maintenance_updated_at on marketing_managed_property_maintenance;
create trigger marketing_managed_property_maintenance_updated_at before update on marketing_managed_property_maintenance
for each row execute function set_updated_at();

drop trigger if exists marketing_managed_property_contacts_validate_owner on marketing_managed_property_contacts;
create trigger marketing_managed_property_contacts_validate_owner before insert or update of property_id, profile_id on marketing_managed_property_contacts
for each row execute function validate_marketing_managed_property_child_owner();
drop trigger if exists marketing_managed_property_ota_links_validate_owner on marketing_managed_property_ota_links;
create trigger marketing_managed_property_ota_links_validate_owner before insert or update of property_id, profile_id on marketing_managed_property_ota_links
for each row execute function validate_marketing_managed_property_child_owner();
drop trigger if exists marketing_managed_property_maintenance_validate_owner on marketing_managed_property_maintenance;
create trigger marketing_managed_property_maintenance_validate_owner before insert or update of property_id, profile_id on marketing_managed_property_maintenance
for each row execute function validate_marketing_managed_property_child_owner();
drop trigger if exists marketing_managed_property_documents_validate_owner on marketing_managed_property_documents;
create trigger marketing_managed_property_documents_validate_owner before insert or update of property_id, profile_id on marketing_managed_property_documents
for each row execute function validate_marketing_managed_property_child_owner();

alter table marketing_managed_properties enable row level security;
alter table marketing_managed_property_contacts enable row level security;
alter table marketing_managed_property_ota_links enable row level security;
alter table marketing_managed_property_maintenance enable row level security;
alter table marketing_managed_property_documents enable row level security;

drop policy if exists "marketing_managed_properties_owner_access" on marketing_managed_properties;
create policy "marketing_managed_properties_owner_access" on marketing_managed_properties for all to authenticated
using (profile_id = current_profile_id() or is_super_admin())
with check (profile_id = current_profile_id() or is_super_admin());

drop policy if exists "marketing_managed_property_contacts_owner_access" on marketing_managed_property_contacts;
create policy "marketing_managed_property_contacts_owner_access" on marketing_managed_property_contacts for all to authenticated
using (profile_id = current_profile_id() or is_super_admin())
with check (profile_id = current_profile_id() or is_super_admin());

drop policy if exists "marketing_managed_property_ota_links_owner_access" on marketing_managed_property_ota_links;
create policy "marketing_managed_property_ota_links_owner_access" on marketing_managed_property_ota_links for all to authenticated
using (profile_id = current_profile_id() or is_super_admin())
with check (profile_id = current_profile_id() or is_super_admin());

drop policy if exists "marketing_managed_property_maintenance_owner_access" on marketing_managed_property_maintenance;
create policy "marketing_managed_property_maintenance_owner_access" on marketing_managed_property_maintenance for all to authenticated
using (profile_id = current_profile_id() or is_super_admin())
with check (profile_id = current_profile_id() or is_super_admin());

drop policy if exists "marketing_managed_property_documents_owner_access" on marketing_managed_property_documents;
create policy "marketing_managed_property_documents_owner_access" on marketing_managed_property_documents for all to authenticated
using (profile_id = current_profile_id() or is_super_admin())
with check (profile_id = current_profile_id() or is_super_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketing-managed-property-covers', 'marketing-managed-property-covers', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketing-managed-property-documents', 'marketing-managed-property-documents', false, 10485760, array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "marketing_managed_property_covers_super_admin_storage_access" on storage.objects;
create policy "marketing_managed_property_covers_super_admin_storage_access" on storage.objects for all to authenticated
using (bucket_id = 'marketing-managed-property-covers' and is_super_admin())
with check (bucket_id = 'marketing-managed-property-covers' and is_super_admin());

drop policy if exists "marketing_managed_property_documents_super_admin_storage_access" on storage.objects;
create policy "marketing_managed_property_documents_super_admin_storage_access" on storage.objects for all to authenticated
using (bucket_id = 'marketing-managed-property-documents' and is_super_admin())
with check (bucket_id = 'marketing-managed-property-documents' and is_super_admin());
