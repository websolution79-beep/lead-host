-- Lead Host PRIME Zone: private 1-to-1 visibility foundation.
-- Existing leads remain public and no publication flow changes in this phase.

alter table public.leads
  add column if not exists visibility_mode text not null default 'public',
  add column if not exists prime_target_property_manager_id uuid
    references public.property_manager_profiles(id) on delete restrict,
  add column if not exists prime_access_started_at timestamptz,
  add column if not exists prime_access_until timestamptz,
  add column if not exists prime_access_expired_at timestamptz,
  add column if not exists prime_released_to_public_at timestamptz,
  add column if not exists prime_assigned_by_profile_id uuid
    references public.profiles(id) on delete set null,
  add column if not exists prime_assigned_by_team_member_id uuid
    references public.team_members(id) on delete set null,
  add column if not exists prime_assigned_by_role text,
  add column if not exists prime_notification_sent_at timestamptz,
  add column if not exists public_notification_sent_at timestamptz;

do $$
begin
  alter table public.leads
    add constraint leads_visibility_mode_valid
    check (visibility_mode in ('public', 'prime_private'));
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.leads
    add constraint leads_prime_access_period_valid
    check (
      prime_access_started_at is null
      or prime_access_until is null
      or prime_access_until > prime_access_started_at
    );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.leads
    add constraint leads_prime_private_fields_required
    check (
      visibility_mode = 'public'
      or (
        prime_target_property_manager_id is not null
        and prime_access_started_at is not null
        and prime_access_until is not null
        and published_at is null
      )
    );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.leads
    add constraint leads_prime_assigned_role_valid
    check (
      prime_assigned_by_role is null
      or prime_assigned_by_role in ('super_admin', 'account_manager')
    );
exception when duplicate_object then null;
end;
$$;

create index if not exists leads_prime_target_access_idx
  on public.leads (prime_target_property_manager_id, prime_access_until desc)
  where visibility_mode = 'prime_private';

create index if not exists leads_prime_expiration_idx
  on public.leads (prime_access_until)
  where visibility_mode = 'prime_private'
    and prime_access_expired_at is null;

create table if not exists public.prime_lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete restrict,
  target_property_manager_id uuid references public.property_manager_profiles(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_team_member_id uuid references public.team_members(id) on delete set null,
  event_type text not null,
  from_visibility_mode text,
  to_visibility_mode text,
  access_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint prime_lead_events_type_length
    check (char_length(btrim(event_type)) between 2 and 100),
  constraint prime_lead_events_from_visibility_valid
    check (from_visibility_mode is null or from_visibility_mode in ('public', 'prime_private')),
  constraint prime_lead_events_to_visibility_valid
    check (to_visibility_mode is null or to_visibility_mode in ('public', 'prime_private')),
  constraint prime_lead_events_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists prime_lead_events_lead_created_idx
  on public.prime_lead_events (lead_id, created_at desc);

create index if not exists prime_lead_events_target_created_idx
  on public.prime_lead_events (target_property_manager_id, created_at desc);

alter table public.prime_lead_events enable row level security;

drop policy if exists "prime_lead_events_super_admin_manage"
  on public.prime_lead_events;
create policy "prime_lead_events_super_admin_manage"
on public.prime_lead_events for all
to authenticated
using (is_super_admin())
with check (is_super_admin());

create or replace function public.profile_can_access_prime_lead(
  p_profile_id uuid,
  p_lead_id uuid,
  p_at timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    join public.user_roles user_role
      on user_role.profile_id = profile.id
      and user_role.role = 'property_manager'
    join public.property_manager_profiles pm
      on pm.profile_id = profile.id
    join public.prime_accounts prime
      on prime.profile_id = profile.id
      and prime.status = 'active'
      and (prime.prime_expires_at is null or prime.prime_expires_at > p_at)
    join public.leads lead
      on lead.id = p_lead_id
      and lead.visibility_mode = 'prime_private'
      and lead.prime_target_property_manager_id = pm.id
      and lead.prime_access_started_at <= p_at
      and lead.prime_access_until > p_at
      and lead.prime_access_expired_at is null
      and lead.internal_status = 'available'
      and lead.exclusive_purchase_id is null
    where profile.id = p_profile_id
      and profile.status = 'active'
  );
$$;

create or replace function public.profile_can_assign_prime_lead(
  p_actor_profile_id uuid,
  p_target_property_manager_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.user_roles
      where profile_id = p_actor_profile_id
        and role = 'super_admin'
    )
    or exists (
      select 1
      from public.team_members member
      join public.team_roles team_role
        on team_role.id = member.role_id
        and team_role.is_active = true
      join public.team_role_permissions permission
        on permission.role_id = team_role.id
        and permission.permission_key = 'prime'
        and permission.access_level = 'write'
      join public.property_manager_profiles target_pm
        on target_pm.id = p_target_property_manager_id
      join public.prime_accounts target_prime
        on target_prime.profile_id = target_pm.profile_id
        and target_prime.account_manager_member_id = member.id
        and target_prime.status = 'active'
      where member.profile_id = p_actor_profile_id
        and member.status = 'active'
    );
$$;

revoke all on function public.profile_can_access_prime_lead(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.profile_can_access_prime_lead(uuid, uuid, timestamptz)
  to service_role;

revoke all on function public.profile_can_assign_prime_lead(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.profile_can_assign_prime_lead(uuid, uuid)
  to service_role;

comment on column public.leads.visibility_mode is
  'public for the standard Marketplace, prime_private for one-to-one PRIME early access.';
comment on column public.leads.prime_target_property_manager_id is
  'Single PRIME Property Manager allowed to view this lead during private access.';
comment on table public.prime_lead_events is
  'Append-only audit history for PRIME lead assignment, expiration, purchase and public release.';
