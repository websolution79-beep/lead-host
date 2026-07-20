alter table profiles
  add column if not exists avatar_url text;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'wallet_transaction_type') then
    create type wallet_transaction_type as enum ('top_up', 'lead_purchase', 'refund', 'adjustment');
  end if;

  if not exists (select 1 from pg_type where typname = 'wallet_transaction_status') then
    create type wallet_transaction_status as enum ('pending', 'completed', 'failed', 'cancelled');
  end if;
end $$;

create table if not exists wallets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles(id) on delete cascade,
  balance_cents integer not null default 0,
  currency text not null default 'eur',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references wallets(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  type wallet_transaction_type not null,
  status wallet_transaction_status not null default 'pending',
  amount_cents integer not null,
  balance_after_cents integer,
  description text,
  provider text,
  provider_reference text,
  lead_purchase_id uuid references lead_purchases(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint wallet_transactions_non_zero_amount check (amount_cents <> 0)
);

create index if not exists wallet_transactions_profile_created_idx
  on wallet_transactions (profile_id, created_at desc);

drop trigger if exists wallets_updated_at on wallets;
create trigger wallets_updated_at
before update on wallets
for each row execute function set_updated_at();

create or replace function current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from profiles
  where auth_user_id = auth.uid()
  limit 1
$$;

create or replace function has_app_role(p_role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from user_roles
    where profile_id = current_profile_id()
      and role = p_role
  )
$$;

create or replace function is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_app_role('super_admin'::app_role)
$$;

create or replace function ensure_wallet(p_profile_id uuid)
returns wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet wallets;
begin
  insert into wallets (profile_id)
  values (p_profile_id)
  on conflict (profile_id) do nothing;

  select *
  into v_wallet
  from wallets
  where profile_id = p_profile_id;

  return v_wallet;
end;
$$;

create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  insert into profiles (
    auth_user_id,
    email,
    first_name,
    last_name,
    phone
  )
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data->>'first_name', ''),
    nullif(new.raw_user_meta_data->>'last_name', ''),
    nullif(new.raw_user_meta_data->>'phone', '')
  )
  on conflict (auth_user_id) do update
    set email = excluded.email
  returning id into v_profile_id;

  insert into user_roles (profile_id, role)
  values (v_profile_id, 'property_manager')
  on conflict (profile_id, role) do nothing;

  perform ensure_wallet(v_profile_id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_auth_user();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

alter table wallets enable row level security;
alter table wallet_transactions enable row level security;

drop policy if exists "profiles_select_own_or_admin" on profiles;
create policy "profiles_select_own_or_admin"
on profiles for select
to authenticated
using (auth_user_id = auth.uid() or is_super_admin());

drop policy if exists "profiles_update_own_or_admin" on profiles;
create policy "profiles_update_own_or_admin"
on profiles for update
to authenticated
using (auth_user_id = auth.uid() or is_super_admin())
with check (auth_user_id = auth.uid() or is_super_admin());

drop policy if exists "user_roles_select_own_or_admin" on user_roles;
create policy "user_roles_select_own_or_admin"
on user_roles for select
to authenticated
using (profile_id = current_profile_id() or is_super_admin());

drop policy if exists "user_roles_admin_insert" on user_roles;
create policy "user_roles_admin_insert"
on user_roles for insert
to authenticated
with check (is_super_admin());

drop policy if exists "user_roles_admin_delete" on user_roles;
create policy "user_roles_admin_delete"
on user_roles for delete
to authenticated
using (is_super_admin());

drop policy if exists "pm_profiles_select_own_or_admin" on property_manager_profiles;
create policy "pm_profiles_select_own_or_admin"
on property_manager_profiles for select
to authenticated
using (profile_id = current_profile_id() or is_super_admin());

drop policy if exists "pm_profiles_upsert_own_or_admin" on property_manager_profiles;
create policy "pm_profiles_upsert_own_or_admin"
on property_manager_profiles for all
to authenticated
using (profile_id = current_profile_id() or is_super_admin())
with check (profile_id = current_profile_id() or is_super_admin());

drop policy if exists "wallets_select_own_or_admin" on wallets;
create policy "wallets_select_own_or_admin"
on wallets for select
to authenticated
using (profile_id = current_profile_id() or is_super_admin());

drop policy if exists "wallet_transactions_select_own_or_admin" on wallet_transactions;
create policy "wallet_transactions_select_own_or_admin"
on wallet_transactions for select
to authenticated
using (profile_id = current_profile_id() or is_super_admin());

drop policy if exists "notifications_select_own_or_admin" on notifications;
create policy "notifications_select_own_or_admin"
on notifications for select
to authenticated
using (profile_id = current_profile_id() or is_super_admin());

drop policy if exists "avatars_select_public" on storage.objects;
create policy "avatars_select_public"
on storage.objects for select
to public
using (bucket_id = 'profile-avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-avatars'
  and exists (
    select 1
    from profiles
    where profiles.auth_user_id = auth.uid()
      and profiles.id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-avatars'
  and exists (
    select 1
    from profiles
    where profiles.auth_user_id = auth.uid()
      and profiles.id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'profile-avatars'
  and exists (
    select 1
    from profiles
    where profiles.auth_user_id = auth.uid()
      and profiles.id::text = (storage.foldername(name))[1]
  )
);
