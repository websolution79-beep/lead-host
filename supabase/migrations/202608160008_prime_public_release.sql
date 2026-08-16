-- PRIME Zone lifecycle: atomically release unsold private leads to the public
-- Marketplace and retain a retryable notification marker.

create or replace function public.release_prime_lead_to_public(
  p_lead_id uuid,
  p_release_reason text default 'manual',
  p_actor_profile_id uuid default null,
  p_actor_team_member_id uuid default null
)
returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_lead public.leads;
  v_target_property_manager_id uuid;
  v_access_until timestamptz;
begin
  if p_release_reason not in ('automatic_expiration', 'manual') then
    raise exception 'prime_release_reason_invalid';
  end if;

  select * into v_lead
  from public.leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'lead_not_found';
  end if;

  if v_lead.visibility_mode <> 'prime_private' then
    raise exception 'lead_not_prime_private';
  end if;

  if v_lead.exclusive_purchase_id is not null
    or v_lead.shared_slots_sold > 0
    or v_lead.internal_status <> 'available' then
    raise exception 'prime_lead_not_releasable';
  end if;

  if p_release_reason = 'automatic_expiration'
    and (v_lead.prime_access_until is null or v_lead.prime_access_until > v_now) then
    raise exception 'prime_access_not_expired';
  end if;

  v_target_property_manager_id := v_lead.prime_target_property_manager_id;
  v_access_until := v_lead.prime_access_until;

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
    v_lead.id,
    v_target_property_manager_id,
    p_actor_profile_id,
    p_actor_team_member_id,
    'released_to_public',
    'prime_private',
    'public',
    v_access_until,
    jsonb_build_object('release_reason', p_release_reason)
  );

  update public.leads
  set
    internal_status = 'available',
    public_status = 'available',
    visibility_mode = 'public',
    prime_target_property_manager_id = null,
    prime_access_expired_at = v_now,
    prime_released_to_public_at = v_now,
    public_notification_sent_at = null,
    published_at = v_now,
    expires_at = v_now + make_interval(days => public.lead_availability_days()),
    visible_until = null,
    sold_at = null,
    sold_visible_until = null
  where id = v_lead.id
  returning * into v_lead;

  return v_lead;
end;
$$;

create or replace function public.release_expired_prime_leads(
  p_limit integer default 100
)
returns setof public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
begin
  for v_lead_id in
    select lead.id
    from public.leads lead
    where lead.visibility_mode = 'prime_private'
      and lead.prime_access_until <= now()
      and lead.prime_access_expired_at is null
      and lead.internal_status = 'available'
      and lead.exclusive_purchase_id is null
      and lead.shared_slots_sold = 0
    order by lead.prime_access_until asc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update skip locked
  loop
    return next public.release_prime_lead_to_public(
      v_lead_id,
      'automatic_expiration',
      null,
      null
    );
  end loop;

  return;
end;
$$;

revoke all on function public.release_prime_lead_to_public(uuid, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.release_prime_lead_to_public(uuid, text, uuid, uuid)
  to service_role;

revoke all on function public.release_expired_prime_leads(integer)
  from public, anon, authenticated;
grant execute on function public.release_expired_prime_leads(integer)
  to service_role;

comment on function public.release_prime_lead_to_public(uuid, text, uuid, uuid) is
  'Atomically releases one unsold PRIME lead to the public Marketplace.';
comment on function public.release_expired_prime_leads(integer) is
  'Releases expired, unsold PRIME leads. Safe to call repeatedly.';
