-- PRIME Zone assignment and configurable private-access duration.

insert into public.settings (key, value)
values ('prime.default_access_duration_hours', '12'::jsonb)
on conflict (key) do nothing;

create or replace function public.assign_lead_to_prime(
  p_lead_id uuid,
  p_target_property_manager_id uuid,
  p_access_until timestamptz,
  p_actor_profile_id uuid,
  p_actor_team_member_id uuid default null,
  p_actor_role text default 'super_admin'
)
returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_lead public.leads;
  v_from_visibility text;
begin
  if p_access_until <= v_now then
    raise exception 'prime_access_until_must_be_future';
  end if;

  if p_actor_role not in ('super_admin', 'account_manager') then
    raise exception 'prime_actor_role_invalid';
  end if;

  if not public.profile_can_assign_prime_lead(
    p_actor_profile_id,
    p_target_property_manager_id
  ) then
    raise exception 'prime_assignment_not_allowed';
  end if;

  if not exists (
    select 1
    from public.property_manager_profiles pm
    join public.profiles profile
      on profile.id = pm.profile_id
      and profile.status = 'active'
    join public.user_roles user_role
      on user_role.profile_id = profile.id
      and user_role.role = 'property_manager'
    join public.prime_accounts prime
      on prime.profile_id = profile.id
      and prime.status = 'active'
      and (prime.prime_expires_at is null or prime.prime_expires_at > v_now)
    where pm.id = p_target_property_manager_id
  ) then
    raise exception 'prime_target_not_active';
  end if;

  select * into v_lead
  from public.leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'lead_not_found';
  end if;

  if v_lead.exclusive_purchase_id is not null
    or v_lead.shared_slots_sold > 0
    or v_lead.internal_status in ('sold_two_pm', 'sold_exclusive') then
    raise exception 'lead_already_sold';
  end if;

  v_from_visibility := v_lead.visibility_mode;

  update public.leads
  set
    internal_status = 'available',
    public_status = 'available',
    shared_slots_sold = 0,
    visibility_mode = 'prime_private',
    prime_target_property_manager_id = p_target_property_manager_id,
    prime_access_started_at = v_now,
    prime_access_until = p_access_until,
    prime_access_expired_at = null,
    prime_released_to_public_at = null,
    prime_assigned_by_profile_id = p_actor_profile_id,
    prime_assigned_by_team_member_id = p_actor_team_member_id,
    prime_assigned_by_role = p_actor_role,
    prime_notification_sent_at = null,
    public_notification_sent_at = null,
    published_at = null,
    expires_at = null,
    visible_until = null,
    sold_at = null,
    sold_visible_until = null
  where id = p_lead_id
  returning * into v_lead;

  insert into public.prime_lead_events (
    lead_id,
    target_property_manager_id,
    actor_profile_id,
    actor_team_member_id,
    event_type,
    from_visibility_mode,
    to_visibility_mode,
    access_until,
    metadata
  )
  values (
    p_lead_id,
    p_target_property_manager_id,
    p_actor_profile_id,
    p_actor_team_member_id,
    'assigned_to_prime',
    v_from_visibility,
    'prime_private',
    p_access_until,
    jsonb_build_object('actor_role', p_actor_role)
  );

  return v_lead;
end;
$$;

revoke all on function public.assign_lead_to_prime(
  uuid,
  uuid,
  timestamptz,
  uuid,
  uuid,
  text
) from public, anon, authenticated;
grant execute on function public.assign_lead_to_prime(
  uuid,
  uuid,
  timestamptz,
  uuid,
  uuid,
  text
) to service_role;

comment on function public.assign_lead_to_prime(
  uuid,
  uuid,
  timestamptz,
  uuid,
  uuid,
  text
) is 'Atomically reserves one unsold lead for one active PRIME Property Manager.';

-- Keep the existing public publication behavior and explicitly clear PRIME visibility.
create or replace function public.publish_lead(p_lead_id uuid)
returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads;
begin
  update public.leads
  set
    internal_status = 'available',
    public_status = 'available',
    visibility_mode = 'public',
    prime_target_property_manager_id = null,
    prime_access_started_at = null,
    prime_access_until = null,
    prime_access_expired_at = null,
    prime_released_to_public_at = null,
    prime_assigned_by_profile_id = null,
    prime_assigned_by_team_member_id = null,
    prime_assigned_by_role = null,
    prime_notification_sent_at = null,
    published_at = now(),
    expires_at = now() + make_interval(days => public.lead_availability_days()),
    visible_until = null,
    sold_at = null,
    sold_visible_until = null
  where id = p_lead_id
  returning * into v_lead;

  if not found then
    raise exception 'lead_not_found';
  end if;

  return v_lead;
end;
$$;

revoke all on function public.publish_lead(uuid)
  from public, anon, authenticated;
grant execute on function public.publish_lead(uuid)
  to service_role;
