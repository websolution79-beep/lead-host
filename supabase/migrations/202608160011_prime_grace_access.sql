-- Keep already assigned PRIME opportunities accessible during the 3-day payment grace period.

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
      and (
        (
          prime.status = 'active'
          and (prime.prime_expires_at is null or prime.prime_expires_at > p_at)
        )
        or (
          prime.status = 'past_due'
          and prime.grace_ends_at is not null
          and prime.grace_ends_at > p_at
        )
      )
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

revoke all on function public.profile_can_access_prime_lead(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.profile_can_access_prime_lead(uuid, uuid, timestamptz)
  to service_role;
