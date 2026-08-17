-- Prepare existing active team members for the compensation rollout.
-- The feature flag deliberately remains disabled until the readiness audit passes.

insert into public.team_member_compensation_rules (
  member_id,
  lead_verification_enabled,
  prime_first_activation_enabled,
  prime_renewal_enabled,
  prime_lead_purchase_enabled
)
select
  member.id,
  true,
  normalized_role.role_key in ('accountmanager', 'accounmanager'),
  normalized_role.role_key in ('accountmanager', 'accounmanager'),
  normalized_role.role_key in ('accountmanager', 'accounmanager')
from public.team_members member
join public.team_roles role
  on role.id = member.role_id
cross join lateral (
  select regexp_replace(lower(trim(role.name)), '[^a-z]', '', 'g') as role_key
) normalized_role
where member.status = 'active'
on conflict (member_id) do nothing;

create or replace function public.get_team_compensation_activation_readiness()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with active_members as (
    select
      member.id,
      member.email,
      role.name as role_name,
      regexp_replace(lower(trim(role.name)), '[^a-z]', '', 'g') as role_key
    from public.team_members member
    join public.team_roles role on role.id = member.role_id
    where member.status = 'active'
  ),
  member_status as (
    select
      active_member.id,
      active_member.email,
      active_member.role_name,
      active_member.role_key,
      rule.id is not null as has_rule,
      coalesce(rule.lead_verification_enabled, false) as lead_enabled,
      coalesce(rule.prime_first_activation_enabled, false) as prime_activation_enabled,
      coalesce(rule.prime_renewal_enabled, false) as prime_renewal_enabled,
      coalesce(rule.prime_lead_purchase_enabled, false) as prime_purchase_enabled
    from active_members active_member
    left join public.team_member_compensation_rules rule
      on rule.member_id = active_member.id
  )
  select jsonb_build_object(
    'featureEnabled', coalesce((
      select feature_enabled
      from public.team_compensation_settings
      where id = true
    ), false),
    'activeMembers', (select count(*) from member_status),
    'configuredMembers', (select count(*) from member_status where has_rule),
    'missingRules', (select count(*) from member_status where not has_rule),
    'accountManagers', (
      select count(*)
      from member_status
      where role_key in ('accountmanager', 'accounmanager')
    ),
    'accountManagersReady', (
      select count(*)
      from member_status
      where role_key in ('accountmanager', 'accounmanager')
        and has_rule
        and lead_enabled
        and prime_activation_enabled
        and prime_renewal_enabled
        and prime_purchase_enabled
    ),
    'members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'email', email,
          'role', role_name,
          'hasRule', has_rule,
          'leadVerification', lead_enabled,
          'primeFirstActivation', prime_activation_enabled,
          'primeRenewal', prime_renewal_enabled,
          'primeLeadPurchase', prime_purchase_enabled
        )
        order by role_name, email
      )
      from member_status
    ), '[]'::jsonb),
    'events', (select count(*) from public.team_compensation_events),
    'pendingOutbox', (
      select count(*)
      from public.team_compensation_outbox
      where status in ('pending', 'processing')
    )
  );
$$;

revoke all on function public.get_team_compensation_activation_readiness() from public;
revoke all on function public.get_team_compensation_activation_readiness() from anon, authenticated;
grant execute on function public.get_team_compensation_activation_readiness() to service_role;

comment on function public.get_team_compensation_activation_readiness() is
  'Service-role-only readiness report used before enabling team compensation.';
