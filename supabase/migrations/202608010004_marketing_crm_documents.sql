-- Private documents and contracts attached to Marketing CRM contacts.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'marketing-crm-documents',
  'marketing-crm-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists marketing_crm_documents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  contact_id uuid not null references marketing_crm_contacts(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  content_type text not null,
  byte_size integer not null,
  created_at timestamptz not null default now(),
  constraint marketing_crm_documents_name_length
    check (char_length(btrim(original_name)) between 1 and 255),
  constraint marketing_crm_documents_path_length
    check (char_length(storage_path) between 1 and 500),
  constraint marketing_crm_documents_size_range
    check (byte_size between 1 and 10485760),
  constraint marketing_crm_documents_allowed_type
    check (content_type in (
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ))
);

create index if not exists marketing_crm_documents_contact_created_idx
  on marketing_crm_documents (contact_id, created_at desc);

create index if not exists marketing_crm_documents_profile_created_idx
  on marketing_crm_documents (profile_id, created_at desc);

alter table marketing_crm_documents enable row level security;

drop policy if exists "marketing_crm_documents_owner_access" on marketing_crm_documents;
create policy "marketing_crm_documents_owner_access"
on marketing_crm_documents for all
to authenticated
using (profile_id = current_profile_id() or is_super_admin())
with check (profile_id = current_profile_id() or is_super_admin());

-- Objects are never public. Application access is via short-lived signed URLs.
drop policy if exists "marketing_crm_documents_super_admin_storage_access" on storage.objects;
create policy "marketing_crm_documents_super_admin_storage_access"
on storage.objects for all
to authenticated
using (bucket_id = 'marketing-crm-documents' and is_super_admin())
with check (bucket_id = 'marketing-crm-documents' and is_super_admin());
