-- Read model for the Super Admin compensation console.

create or replace function public.get_admin_team_compensation_dashboard(
  p_status text default null,
  p_event_type text default null,
  p_member_id uuid default null,
  p_search text default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with parameters as (
    select
      nullif(trim(p_status), '') as status_filter,
      nullif(trim(p_event_type), '') as type_filter,
      nullif(trim(p_search), '') as search_filter,
      greatest(1, p_page) as page_number,
      greatest(1, least(p_page_size, 100)) as page_size
  ),
  event_details as (
    select
      event.id,
      event.member_id,
      event.event_type,
      event.status,
      event.source_type,
      event.source_id,
      event.source_event_key,
      event.owner_request_id,
      event.lead_id,
      event.property_manager_profile_id,
      event.amount_cents,
      event.base_amount_cents,
      event.fixed_rate_cents,
      event.rate_basis_points,
      event.currency,
      event.description,
      event.occurred_at,
      event.accrued_at,
      event.void_reason,
      member_profile.first_name as member_first_name,
      member_profile.last_name as member_last_name,
      member_profile.email as member_email,
      role.name as member_role_name,
      pm_profile.first_name as pm_first_name,
      pm_profile.last_name as pm_last_name,
      pm_profile.email as pm_email,
      lead.title as lead_title
    from public.team_compensation_events event
    left join public.team_members member on member.id = event.member_id
    left join public.profiles member_profile on member_profile.id = member.profile_id
    left join public.team_roles role on role.id = member.role_id
    left join public.profiles pm_profile
      on pm_profile.id = event.property_manager_profile_id
    left join public.leads lead on lead.id = event.lead_id
  ),
  filtered as (
    select details.*
    from event_details details
    cross join parameters params
    where (params.status_filter is null or details.status = params.status_filter)
      and (params.type_filter is null or details.event_type = params.type_filter)
      and (p_member_id is null or details.member_id = p_member_id)
      and (
        params.search_filter is null
        or concat_ws(' ',
          details.description,
          details.member_first_name,
          details.member_last_name,
          details.member_email,
          details.pm_first_name,
          details.pm_last_name,
          details.pm_email,
          details.lead_title
        ) ilike '%' || params.search_filter || '%'
      )
  ),
  stats as (
    select
      count(*)::integer as event_count,
      coalesce(sum(amount_cents) filter (
        where status = 'accrued' and amount_cents > 0
      ), 0)::bigint as gross_accrued_cents,
      coalesce(abs(sum(amount_cents) filter (
        where status = 'accrued' and amount_cents < 0
      )), 0)::bigint as adjustments_cents,
      coalesce(sum(amount_cents) filter (
        where status = 'accrued'
      ), 0)::bigint as net_accrued_cents,
      coalesce(sum(amount_cents) filter (
        where status = 'pending_attribution'
      ), 0)::bigint as pending_attribution_cents,
      count(*) filter (
        where status = 'pending_attribution'
      )::integer as pending_attribution_count
    from filtered
  ),
  member_totals as (
    select
      details.member_id,
      max(details.member_first_name) as first_name,
      max(details.member_last_name) as last_name,
      max(details.member_email) as email,
      max(details.member_role_name) as role_name,
      count(*)::integer as event_count,
      coalesce(sum(details.amount_cents) filter (
        where details.amount_cents > 0
      ), 0)::bigint as gross_cents,
      coalesce(abs(sum(details.amount_cents) filter (
        where details.amount_cents < 0
      )), 0)::bigint as adjustments_cents,
      coalesce(sum(details.amount_cents), 0)::bigint as net_cents
    from filtered details
    where details.status = 'accrued'
      and details.member_id is not null
    group by details.member_id
  ),
  paged as (
    select details.*
    from filtered details
    cross join parameters params
    order by details.occurred_at desc, details.id desc
    limit (select page_size from parameters)
    offset (
      ((select page_number from parameters) - 1)
      * (select page_size from parameters)
    )
  ),
  active_members as (
    select
      member.id,
      profile.first_name,
      profile.last_name,
      profile.email,
      role.name as role_name
    from public.team_members member
    join public.profiles profile on profile.id = member.profile_id
    join public.team_roles role on role.id = member.role_id
    where member.status = 'active'
    order by profile.first_name, profile.last_name, profile.email
  )
  select jsonb_build_object(
    'featureEnabled', coalesce((
      select feature_enabled
      from public.team_compensation_settings
      where id = true
    ), false),
    'stats', jsonb_build_object(
      'eventCount', stats.event_count,
      'grossAccruedCents', stats.gross_accrued_cents,
      'adjustmentsCents', stats.adjustments_cents,
      'netAccruedCents', stats.net_accrued_cents,
      'pendingAttributionCents', stats.pending_attribution_cents,
      'pendingAttributionCount', stats.pending_attribution_count
    ),
    'memberSummaries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'memberId', totals.member_id,
        'firstName', totals.first_name,
        'lastName', totals.last_name,
        'email', totals.email,
        'roleName', totals.role_name,
        'eventCount', totals.event_count,
        'grossCents', totals.gross_cents,
        'adjustmentsCents', totals.adjustments_cents,
        'netCents', totals.net_cents
      ) order by totals.net_cents desc, totals.last_name, totals.first_name)
      from member_totals totals
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', event.id,
        'memberId', event.member_id,
        'eventType', event.event_type,
        'status', event.status,
        'sourceType', event.source_type,
        'sourceId', event.source_id,
        'ownerRequestId', event.owner_request_id,
        'leadId', event.lead_id,
        'amountCents', event.amount_cents,
        'baseAmountCents', event.base_amount_cents,
        'fixedRateCents', event.fixed_rate_cents,
        'rateBasisPoints', event.rate_basis_points,
        'currency', event.currency,
        'description', event.description,
        'occurredAt', event.occurred_at,
        'accruedAt', event.accrued_at,
        'voidReason', event.void_reason,
        'memberFirstName', event.member_first_name,
        'memberLastName', event.member_last_name,
        'memberEmail', event.member_email,
        'memberRoleName', event.member_role_name,
        'propertyManagerFirstName', event.pm_first_name,
        'propertyManagerLastName', event.pm_last_name,
        'propertyManagerEmail', event.pm_email,
        'leadTitle', event.lead_title
      ) order by event.occurred_at desc, event.id desc)
      from paged event
    ), '[]'::jsonb),
    'activeMembers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', member.id,
        'firstName', member.first_name,
        'lastName', member.last_name,
        'email', member.email,
        'roleName', member.role_name
      ) order by member.first_name, member.last_name, member.email)
      from active_members member
    ), '[]'::jsonb),
    'pagination', jsonb_build_object(
      'page', (select page_number from parameters),
      'pageSize', (select page_size from parameters),
      'totalItems', (select count(*) from filtered),
      'totalPages', greatest(1, ceil(
        (select count(*) from filtered)::numeric
        / (select page_size from parameters)
      )::integer)
    )
  )
  from stats;
$$;

revoke execute on function public.get_admin_team_compensation_dashboard(
  text, text, uuid, text, integer, integer
) from public, anon, authenticated;

grant execute on function public.get_admin_team_compensation_dashboard(
  text, text, uuid, text, integer, integer
) to service_role;

