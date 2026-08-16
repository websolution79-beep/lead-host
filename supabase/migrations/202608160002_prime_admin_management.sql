-- PRIME admin management and Team permission.

insert into public.team_permissions (
  key,
  section,
  label,
  description,
  supports_write,
  sort_order
)
values (
  'prime',
  'Operativita',
  'Lead Host PRIME',
  'Consultare il portafoglio PRIME assegnato. Il livello gestione abilita le operazioni consentite sul proprio portafoglio.',
  true,
  55
)
on conflict (key) do update
set
  section = excluded.section,
  label = excluded.label,
  description = excluded.description,
  supports_write = excluded.supports_write,
  sort_order = excluded.sort_order;

create or replace function public.ensure_prime_account(p_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id uuid;
  v_account_id uuid;
begin
  if not exists (
    select 1
    from public.user_roles
    where profile_id = p_profile_id
      and role = 'property_manager'
  ) then
    raise exception 'Il profilo selezionato non e un Property Manager.';
  end if;

  select id into v_product_id
  from public.addon_products
  where slug = 'lead-host-prime';

  if v_product_id is null then
    raise exception 'Prodotto Lead Host PRIME non configurato.';
  end if;

  insert into public.prime_accounts (profile_id, addon_product_id)
  values (p_profile_id, v_product_id)
  on conflict (profile_id) do update
  set addon_product_id = excluded.addon_product_id
  returning id into v_account_id;

  return v_account_id;
end;
$$;

create or replace function public.admin_set_prime_eligibility(
  p_profile_id uuid,
  p_enabled boolean,
  p_actor_profile_id uuid,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_account_id uuid;
  v_status text;
begin
  v_account_id := public.ensure_prime_account(p_profile_id);

  insert into public.prime_eligibilities (
    profile_id,
    is_enabled,
    enabled_at,
    enabled_by,
    disabled_at,
    disabled_by,
    notes
  )
  values (
    p_profile_id,
    p_enabled,
    case when p_enabled then v_now else null end,
    case when p_enabled then p_actor_profile_id else null end,
    case when not p_enabled then v_now else null end,
    case when not p_enabled then p_actor_profile_id else null end,
    nullif(btrim(p_notes), '')
  )
  on conflict (profile_id) do update
  set
    is_enabled = excluded.is_enabled,
    enabled_at = case
      when excluded.is_enabled then v_now
      else public.prime_eligibilities.enabled_at
    end,
    enabled_by = case
      when excluded.is_enabled then p_actor_profile_id
      else public.prime_eligibilities.enabled_by
    end,
    disabled_at = case when excluded.is_enabled then null else v_now end,
    disabled_by = case when excluded.is_enabled then null else p_actor_profile_id end,
    notes = excluded.notes;

  select status into v_status
  from public.prime_accounts
  where id = v_account_id;

  insert into public.prime_account_events (
    prime_account_id,
    profile_id,
    actor_profile_id,
    event_type,
    from_status,
    to_status,
    reason,
    metadata
  )
  values (
    v_account_id,
    p_profile_id,
    p_actor_profile_id,
    case when p_enabled then 'eligibility_enabled' else 'eligibility_disabled' end,
    v_status,
    v_status,
    nullif(btrim(p_notes), ''),
    jsonb_build_object('eligible', p_enabled)
  );

  return v_account_id;
end;
$$;

create or replace function public.admin_manage_prime_access(
  p_profile_id uuid,
  p_action text,
  p_actor_profile_id uuid,
  p_expires_at timestamptz default null,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_account_id uuid;
  v_from_status text;
  v_to_status text;
begin
  if p_action not in ('activate', 'suspend', 'deactivate') then
    raise exception 'Azione PRIME non valida.';
  end if;

  if p_action = 'activate' and p_expires_at is not null and p_expires_at <= v_now then
    raise exception 'La scadenza PRIME deve essere futura.';
  end if;

  v_account_id := public.ensure_prime_account(p_profile_id);

  select status into v_from_status
  from public.prime_accounts
  where id = v_account_id
  for update;

  v_to_status := case
    when p_action = 'activate' then 'active'
    when p_action = 'suspend' then 'suspended'
    else 'inactive'
  end;

  if p_action = 'activate' then
    update public.prime_accounts
    set
      status = 'active',
      access_source = 'manual',
      prime_started_at = coalesce(prime_started_at, v_now),
      prime_expires_at = p_expires_at,
      last_activated_at = v_now,
      grace_ends_at = null,
      payment_status = 'not_applicable',
      admin_override_active = true,
      admin_override_started_at = v_now,
      admin_override_expires_at = p_expires_at,
      admin_override_reason = nullif(btrim(p_reason), ''),
      admin_override_granted_by = p_actor_profile_id
    where id = v_account_id;
  elsif p_action = 'suspend' then
    update public.prime_accounts
    set
      status = 'suspended',
      admin_override_active = false,
      admin_override_reason = nullif(btrim(p_reason), ''),
      admin_override_granted_by = p_actor_profile_id
    where id = v_account_id;
  else
    update public.prime_accounts
    set
      status = 'inactive',
      access_source = 'none',
      prime_expires_at = v_now,
      grace_ends_at = null,
      payment_status = 'not_applicable',
      admin_override_active = false,
      admin_override_started_at = null,
      admin_override_expires_at = null,
      admin_override_reason = nullif(btrim(p_reason), ''),
      admin_override_granted_by = p_actor_profile_id
    where id = v_account_id;
  end if;

  insert into public.prime_account_events (
    prime_account_id,
    profile_id,
    actor_profile_id,
    event_type,
    from_status,
    to_status,
    reason,
    metadata
  )
  values (
    v_account_id,
    p_profile_id,
    p_actor_profile_id,
    'manual_' || p_action,
    v_from_status,
    v_to_status,
    nullif(btrim(p_reason), ''),
    jsonb_build_object('expires_at', p_expires_at)
  );

  return v_account_id;
end;
$$;

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
  set account_manager_member_id = p_member_id
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

revoke all on function public.ensure_prime_account(uuid) from public, anon, authenticated;
revoke all on function public.admin_set_prime_eligibility(uuid, boolean, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_manage_prime_access(uuid, text, uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.admin_assign_prime_manager(uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function public.ensure_prime_account(uuid) to service_role;
grant execute on function public.admin_set_prime_eligibility(uuid, boolean, uuid, text) to service_role;
grant execute on function public.admin_manage_prime_access(uuid, text, uuid, timestamptz, text) to service_role;
grant execute on function public.admin_assign_prime_manager(uuid, uuid, uuid) to service_role;
