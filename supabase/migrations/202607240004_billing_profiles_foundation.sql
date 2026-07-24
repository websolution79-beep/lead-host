do $$
begin
  if not exists (select 1 from pg_type where typname = 'billing_subject_type') then
    create type billing_subject_type as enum ('individual', 'company');
  end if;
end $$;

create table if not exists billing_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles(id) on delete cascade,
  subject_type billing_subject_type not null default 'individual',
  first_name text,
  last_name text,
  fiscal_code text,
  company_name text,
  vat_number text,
  company_fiscal_code text,
  address_line text,
  postal_code text,
  city text,
  province text,
  country text not null default 'IT',
  sdi_code text,
  pec text,
  invoice_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists billing_profiles_updated_at on billing_profiles;
create trigger billing_profiles_updated_at
before update on billing_profiles
for each row execute function set_updated_at();

alter table billing_profiles enable row level security;

drop policy if exists "billing_profiles_select_own_or_admin" on billing_profiles;
create policy "billing_profiles_select_own_or_admin"
on billing_profiles for select
to authenticated
using (profile_id = current_profile_id() or is_super_admin());

drop policy if exists "billing_profiles_insert_own_or_admin" on billing_profiles;
create policy "billing_profiles_insert_own_or_admin"
on billing_profiles for insert
to authenticated
with check (profile_id = current_profile_id() or is_super_admin());

drop policy if exists "billing_profiles_update_own_or_admin" on billing_profiles;
create policy "billing_profiles_update_own_or_admin"
on billing_profiles for update
to authenticated
using (profile_id = current_profile_id() or is_super_admin())
with check (profile_id = current_profile_id() or is_super_admin());
