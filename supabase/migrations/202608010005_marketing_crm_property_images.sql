-- Private, optimized property images attached to Marketing CRM contacts.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'marketing-crm-property-images',
  'marketing-crm-property-images',
  false,
  1048576,
  array['image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists marketing_crm_property_images (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  contact_id uuid not null references marketing_crm_contacts(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  byte_size integer not null,
  width integer not null,
  height integer not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint marketing_crm_property_images_name_length
    check (char_length(btrim(original_name)) between 1 and 255),
  constraint marketing_crm_property_images_path_length
    check (char_length(storage_path) between 1 and 500),
  constraint marketing_crm_property_images_size_range
    check (byte_size between 1 and 1048576),
  constraint marketing_crm_property_images_width_range
    check (width between 1 and 1920),
  constraint marketing_crm_property_images_height_range
    check (height between 1 and 1920)
);

create index if not exists marketing_crm_property_images_contact_position_idx
  on marketing_crm_property_images (contact_id, position, created_at);

alter table marketing_crm_property_images enable row level security;

drop policy if exists "marketing_crm_property_images_owner_access" on marketing_crm_property_images;
create policy "marketing_crm_property_images_owner_access"
on marketing_crm_property_images for all
to authenticated
using (profile_id = current_profile_id() or is_super_admin())
with check (profile_id = current_profile_id() or is_super_admin());

drop policy if exists "marketing_crm_property_images_super_admin_storage_access" on storage.objects;
create policy "marketing_crm_property_images_super_admin_storage_access"
on storage.objects for all
to authenticated
using (bucket_id = 'marketing-crm-property-images' and is_super_admin())
with check (bucket_id = 'marketing-crm-property-images' and is_super_admin());
