alter type app_role add value if not exists 'team_member';

create table if not exists team_permissions (
  key text primary key,
  section text not null,
  label text not null,
  description text not null,
  supports_write boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint team_permissions_key_format
    check (key ~ '^[a-z][a-z0-9_]*$')
);

create table if not exists team_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  updated_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_roles_name_length
    check (char_length(trim(name)) between 2 and 80)
);

create unique index if not exists team_roles_name_unique_idx
  on team_roles (lower(trim(name)));

create table if not exists team_role_permissions (
  role_id uuid not null references team_roles(id) on delete cascade,
  permission_key text not null references team_permissions(key) on delete cascade,
  access_level text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (role_id, permission_key),
  constraint team_role_permissions_access_level
    check (access_level in ('read', 'write'))
);

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles(id) on delete cascade,
  role_id uuid not null references team_roles(id) on delete restrict,
  status text not null default 'active',
  creation_mode text not null,
  must_change_password boolean not null default false,
  invited_by uuid references profiles(id) on delete set null,
  invited_at timestamptz,
  joined_at timestamptz,
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_members_status
    check (status in ('invited', 'active', 'suspended')),
  constraint team_members_creation_mode
    check (creation_mode in ('invite', 'manual'))
);

create index if not exists team_members_role_status_idx
  on team_members (role_id, status);

create index if not exists team_members_status_created_idx
  on team_members (status, created_at desc);

drop trigger if exists team_roles_updated_at on team_roles;
create trigger team_roles_updated_at
before update on team_roles
for each row execute function set_updated_at();

drop trigger if exists team_role_permissions_updated_at on team_role_permissions;
create trigger team_role_permissions_updated_at
before update on team_role_permissions
for each row execute function set_updated_at();

drop trigger if exists team_members_updated_at on team_members;
create trigger team_members_updated_at
before update on team_members
for each row execute function set_updated_at();

insert into team_permissions (
  key,
  section,
  label,
  description,
  supports_write,
  sort_order
)
values
  ('dashboard', 'Panoramica', 'Dashboard', 'Visualizzare KPI e situazione generale della piattaforma.', false, 10),
  ('leads', 'Operativita', 'Lead', 'Visualizzare o gestire verifica, modifica, approvazione e pubblicazione dei lead.', true, 20),
  ('acquisition', 'Operativita', 'Acquisizione', 'Visualizzare o modificare canali di acquisizione, Meta e webhook.', true, 30),
  ('property_managers', 'Operativita', 'Property Manager', 'Visualizzare o gestire profili e stato dei Property Manager.', true, 40),
  ('support', 'Operativita', 'Assistenza', 'Visualizzare o gestire richieste e conversazioni di assistenza.', true, 50),
  ('payments', 'Finanza', 'Pagamenti', 'Visualizzare pagamenti e ricariche wallet.', false, 60),
  ('coupons', 'Finanza', 'Coupon', 'Visualizzare o gestire coupon e promozioni wallet.', true, 70),
  ('billing', 'Finanza', 'Fatturazione', 'Visualizzare o gestire impostazioni e documenti di fatturazione.', true, 80),
  ('refunds', 'Finanza', 'Riaccrediti', 'Visualizzare o gestire richieste di riaccredito wallet.', true, 90),
  ('emails', 'Comunicazioni', 'Email', 'Visualizzare o gestire template e invii email di servizio.', true, 100),
  ('brevo', 'Comunicazioni', 'Brevo', 'Visualizzare o gestire sincronizzazione e consensi Brevo.', true, 110),
  ('telegram', 'Comunicazioni', 'Telegram', 'Visualizzare o gestire integrazione e invii Telegram.', true, 120),
  ('analytics', 'Dati e controllo', 'Analytics', 'Visualizzare analytics e metriche di business.', false, 130),
  ('tracking', 'Dati e controllo', 'Tracking', 'Visualizzare o gestire pixel, eventi e integrazioni di tracking.', true, 140),
  ('settings', 'Configurazione', 'Impostazioni', 'Visualizzare o modificare impostazioni commerciali e registrazioni.', true, 150)
on conflict (key) do update
set
  section = excluded.section,
  label = excluded.label,
  description = excluded.description,
  supports_write = excluded.supports_write,
  sort_order = excluded.sort_order;

create or replace function is_active_team_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from team_members
    where profile_id = current_profile_id()
      and status = 'active'
  )
$$;

create or replace function has_team_permission(
  p_permission_key text,
  p_access_level text default 'read'
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    is_super_admin()
    or exists (
      select 1
      from team_members tm
      join team_roles tr
        on tr.id = tm.role_id
       and tr.is_active = true
      join team_role_permissions trp
        on trp.role_id = tr.id
      where tm.profile_id = current_profile_id()
        and tm.status = 'active'
        and trp.permission_key = p_permission_key
        and (
          p_access_level = 'read'
          or trp.access_level = 'write'
        )
    )
$$;

create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_account_type text;
begin
  v_account_type := coalesce(new.raw_user_meta_data->>'account_type', 'property_manager');

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
    set
      email = excluded.email,
      first_name = coalesce(excluded.first_name, profiles.first_name),
      last_name = coalesce(excluded.last_name, profiles.last_name),
      phone = coalesce(excluded.phone, profiles.phone)
  returning id into v_profile_id;

  if v_account_type = 'team' then
    insert into user_roles (profile_id, role)
    values (v_profile_id, 'team_member')
    on conflict (profile_id, role) do nothing;
  else
    insert into user_roles (profile_id, role)
    values (v_profile_id, 'property_manager')
    on conflict (profile_id, role) do nothing;

    perform ensure_wallet(v_profile_id);
  end if;

  return new;
end;
$$;

alter table team_permissions enable row level security;
alter table team_roles enable row level security;
alter table team_role_permissions enable row level security;
alter table team_members enable row level security;

drop policy if exists "team_permissions_admin_read" on team_permissions;
create policy "team_permissions_admin_read"
on team_permissions for select
to authenticated
using (is_super_admin() or is_active_team_member());

drop policy if exists "team_roles_admin_read" on team_roles;
create policy "team_roles_admin_read"
on team_roles for select
to authenticated
using (
  is_super_admin()
  or exists (
    select 1
    from team_members
    where team_members.profile_id = current_profile_id()
      and team_members.role_id = team_roles.id
      and team_members.status = 'active'
  )
);

drop policy if exists "team_role_permissions_admin_read" on team_role_permissions;
create policy "team_role_permissions_admin_read"
on team_role_permissions for select
to authenticated
using (
  is_super_admin()
  or exists (
    select 1
    from team_members
    where team_members.profile_id = current_profile_id()
      and team_members.role_id = team_role_permissions.role_id
      and team_members.status = 'active'
  )
);

drop policy if exists "team_members_admin_read" on team_members;
create policy "team_members_admin_read"
on team_members for select
to authenticated
using (is_super_admin() or profile_id = current_profile_id());

drop policy if exists "team_permissions_super_admin_manage" on team_permissions;
create policy "team_permissions_super_admin_manage"
on team_permissions for all
to authenticated
using (is_super_admin())
with check (is_super_admin());

drop policy if exists "team_roles_super_admin_manage" on team_roles;
create policy "team_roles_super_admin_manage"
on team_roles for all
to authenticated
using (is_super_admin())
with check (is_super_admin());

drop policy if exists "team_role_permissions_super_admin_manage" on team_role_permissions;
create policy "team_role_permissions_super_admin_manage"
on team_role_permissions for all
to authenticated
using (is_super_admin())
with check (is_super_admin());

drop policy if exists "team_members_super_admin_manage" on team_members;
create policy "team_members_super_admin_manage"
on team_members for all
to authenticated
using (is_super_admin())
with check (is_super_admin());

grant execute on function is_active_team_member() to authenticated;
grant execute on function has_team_permission(text, text) to authenticated;
