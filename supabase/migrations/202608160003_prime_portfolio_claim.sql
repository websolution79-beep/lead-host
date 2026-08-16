-- Atomic PRIME portfolio claim.

alter table public.prime_accounts
  add column if not exists account_manager_assigned_at timestamptz,
  add column if not exists account_manager_assigned_by uuid references public.profiles(id) on delete set null;

create or replace function public.admin_assign_prime_manager(
  p_profile_id uuid,
  p_member_id uuid,
  p_actor_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_previous_member_id uuid;
  v_status text;
begin
  if p_member_id is not null and not exists (
    select 1
    from public.team_members tm
    join public.team_roles tr on tr.id = tm.role_id and tr.is_active = true
    join public.team_role_permissions trp on trp.role_id = tr.id
    where tm.id = p_member_id
      and tm.status = 'active'
      and trp.permission_key = 'prime'
  ) then
    raise exception 'Il membro selezionato non ha un ruolo attivo con permesso PRIME.';
  end if;

  v_account_id := public.ensure_prime_account(p_profile_id);

  select account_manager_member_id, status
  into v_previous_member_id, v_status
  from public.prime_accounts
  where id = v_account_id
  for update;

  update public.prime_accounts
  set
    account_manager_member_id = p_member_id,
    account_manager_assigned_at = case when p_member_id is null then null else now() end,
    account_manager_assigned_by = case when p_member_id is null then null else p_actor_profile_id end
  where id = v_account_id;

  insert into public.prime_account_events (
    prime_account_id,
    profile_id,
    actor_profile_id,
    event_type,
    from_status,
    to_status,
    metadata
  )
  values (
    v_account_id,
    p_profile_id,
    p_actor_profile_id,
    case when p_member_id is null then 'account_manager_unassigned' else 'account_manager_assigned' end,
    v_status,
    v_status,
    jsonb_build_object(
      'previous_member_id', v_previous_member_id,
      'member_id', p_member_id
    )
  );

  return v_account_id;
end;
$$;

create or replace function public.claim_prime_property_manager(
  p_profile_id uuid,
  p_member_id uuid,
  p_actor_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_claimed_id uuid;
  v_current_member_id uuid;
  v_status text;
begin
  if not exists (
    select 1
    from public.team_members tm
    join public.team_roles tr on tr.id = tm.role_id and tr.is_active = true
    join public.team_role_permissions trp on trp.role_id = tr.id
    where tm.id = p_member_id
      and tm.profile_id = p_actor_profile_id
      and tm.status = 'active'
      and trp.permission_key = 'prime'
      and trp.access_level = 'write'
  ) then
    raise exception 'Account Manager non autorizzato alla presa in carico PRIME.';
  end if;

  v_account_id := public.ensure_prime_account(p_profile_id);

  update public.prime_accounts
  set
    account_manager_member_id = p_member_id,
    account_manager_assigned_at = now(),
    account_manager_assigned_by = p_actor_profile_id
  where id = v_account_id
    and account_manager_member_id is null
  returning id, status into v_claimed_id, v_status;

  if v_claimed_id is null then
    select account_manager_member_id into v_current_member_id
    from public.prime_accounts
    where id = v_account_id;

    if v_current_member_id = p_member_id then
      return v_account_id;
    end if;

    raise exception 'Questo Property Manager e gia stato preso in carico.';
  end if;

  insert into public.prime_account_events (
    prime_account_id,
    profile_id,
    actor_profile_id,
    event_type,
    from_status,
    to_status,
    metadata
  )
  values (
    v_account_id,
    p_profile_id,
    p_actor_profile_id,
    'account_manager_claimed',
    v_status,
    v_status,
    jsonb_build_object('member_id', p_member_id)
  );

  return v_account_id;
end;
$$;

revoke all on function public.claim_prime_property_manager(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_prime_property_manager(uuid, uuid, uuid)
  to service_role;
