-- Private read model for the authenticated Team member earnings area.
-- The function is service-role only; the API resolves the member id from the session.

create or replace function public.get_team_member_earnings_dashboard(
  p_member_id uuid,
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
      greatest(1, p_page) as page_number,
      greatest(1, least(p_page_size, 100)) as page_size
  ),
  selected_member as (
    select
      member.id,
      member.status,
      profile.first_name,
      profile.last_name,
      profile.email,
      role.name as role_name
    from public.team_members member
    join public.profiles profile on profile.id = member.profile_id
    join public.team_roles role on role.id = member.role_id
    where member.id = p_member_id
  ),
  effective_rules as (
    select
      coalesce(rule.lead_verification_enabled, true) as lead_verification_enabled,
      coalesce(rule.prime_first_activation_enabled, false) as prime_first_activation_enabled,
      coalesce(rule.prime_renewal_enabled, false) as prime_renewal_enabled,
      coalesce(rule.prime_lead_purchase_enabled, false) as prime_lead_purchase_enabled,
      coalesce(rule.lead_verification_cents_override, settings.lead_verification_cents) as lead_verification_cents,
      coalesce(rule.prime_first_activation_cents_override, settings.prime_first_activation_cents) as prime_first_activation_cents,
      coalesce(rule.prime_renewal_cents_override, settings.prime_renewal_cents) as prime_renewal_cents,
      coalesce(rule.prime_lead_purchase_basis_points_override, settings.prime_lead_purchase_basis_points) as prime_lead_purchase_basis_points
    from public.team_compensation_settings settings
    left join public.team_member_compensation_rules rule
      on rule.member_id = p_member_id
    where settings.id = true
  ),
  event_details as (
    select
      event.id,
      event.event_type,
      event.status,
      event.amount_cents,
      event.base_amount_cents,
      event.fixed_rate_cents,
      event.rate_basis_points,
      event.currency,
      event.description,
      event.occurred_at,
      event.accrued_at,
      event.void_reason,
      event.property_manager_profile_id,
      event.lead_id,
      pm.first_name as pm_first_name,
      pm.last_name as pm_last_name,
      lead.title as lead_title,
      coalesce((
        select sum(allocation.amount_cents)
        from public.team_compensation_payout_allocations allocation
        join public.team_compensation_payouts payout
          on payout.id = allocation.payout_id
        where allocation.compensation_event_id = event.id
          and payout.status = 'completed'
      ), 0)::bigint as paid_cents
    from public.team_compensation_events event
    left join public.profiles pm on pm.id = event.property_manager_profile_id
    left join public.leads lead on lead.id = event.lead_id
    where event.member_id = p_member_id
  ),
  summary as (
    select
      count(*) filter (where status = 'accrued')::integer as event_count,
      coalesce(sum(amount_cents) filter (
        where status = 'accrued' and amount_cents > 0
      ), 0)::bigint as gross_accrued_cents,
      coalesce(abs(sum(amount_cents) filter (
        where status = 'accrued' and amount_cents < 0
      )), 0)::bigint as adjustments_cents,
      coalesce(sum(amount_cents) filter (
        where status = 'accrued'
      ), 0)::bigint as net_accrued_cents
    from event_details
  ),
  paid_summary as (
    select coalesce(sum(amount_cents), 0)::bigint as paid_cents
    from public.team_compensation_payouts
    where member_id = p_member_id and status = 'completed'
  ),
  paged_events as (
    select event.*
    from event_details event
    cross join parameters params
    order by event.occurred_at desc, event.id desc
    limit (select page_size from parameters)
    offset (
      ((select page_number from parameters) - 1)
      * (select page_size from parameters)
    )
  ),
  recent_payouts as (
    select payout.*
    from public.team_compensation_payouts payout
    where payout.member_id = p_member_id
    order by payout.paid_at desc, payout.created_at desc
    limit 50
  )
  select jsonb_build_object(
    'featureEnabled', coalesce((
      select feature_enabled
      from public.team_compensation_settings
      where id = true
    ), false),
    'member', coalesce((
      select jsonb_build_object(
        'memberId', member.id,
        'status', member.status,
        'firstName', member.first_name,
        'lastName', member.last_name,
        'email', member.email,
        'roleName', member.role_name
      )
      from selected_member member
    ), '{}'::jsonb),
    'rules', coalesce((
      select jsonb_build_object(
        'leadVerificationEnabled', rules.lead_verification_enabled,
        'primeFirstActivationEnabled', rules.prime_first_activation_enabled,
        'primeRenewalEnabled', rules.prime_renewal_enabled,
        'primeLeadPurchaseEnabled', rules.prime_lead_purchase_enabled,
        'leadVerificationCents', rules.lead_verification_cents,
        'primeFirstActivationCents', rules.prime_first_activation_cents,
        'primeRenewalCents', rules.prime_renewal_cents,
        'primeLeadPurchaseBasisPoints', rules.prime_lead_purchase_basis_points
      )
      from effective_rules rules
    ), '{}'::jsonb),
    'summary', jsonb_build_object(
      'eventCount', summary.event_count,
      'grossAccruedCents', summary.gross_accrued_cents,
      'adjustmentsCents', summary.adjustments_cents,
      'netAccruedCents', summary.net_accrued_cents,
      'paidCents', paid.paid_cents,
      'dueCents', greatest(summary.net_accrued_cents - paid.paid_cents, 0)
    ),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', event.id,
        'eventType', event.event_type,
        'status', event.status,
        'amountCents', event.amount_cents,
        'baseAmountCents', event.base_amount_cents,
        'fixedRateCents', event.fixed_rate_cents,
        'rateBasisPoints', event.rate_basis_points,
        'currency', event.currency,
        'description', event.description,
        'occurredAt', event.occurred_at,
        'accruedAt', event.accrued_at,
        'voidReason', event.void_reason,
        'paidCents', event.paid_cents,
        'propertyManagerFirstName', event.pm_first_name,
        'propertyManagerLastName', event.pm_last_name,
        'leadTitle', event.lead_title
      ) order by event.occurred_at desc, event.id desc)
      from paged_events event
    ), '[]'::jsonb),
    'payouts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', payout.id,
        'status', payout.status,
        'amountCents', payout.amount_cents,
        'currency', payout.currency,
        'paymentMethod', payout.payment_method,
        'paymentReference', payout.payment_reference,
        'notes', payout.notes,
        'paidAt', payout.paid_at,
        'voidedAt', payout.voided_at,
        'voidReason', payout.void_reason
      ) order by payout.paid_at desc, payout.created_at desc)
      from recent_payouts payout
    ), '[]'::jsonb),
    'pagination', jsonb_build_object(
      'page', (select page_number from parameters),
      'pageSize', (select page_size from parameters),
      'totalItems', (select count(*) from event_details),
      'totalPages', greatest(1, ceil(
        (select count(*) from event_details)::numeric
        / (select page_size from parameters)
      )::integer)
    )
  )
  from summary
  cross join paid_summary paid;
$$;

revoke execute on function public.get_team_member_earnings_dashboard(uuid, integer, integer)
  from public, anon, authenticated;

grant execute on function public.get_team_member_earnings_dashboard(uuid, integer, integer)
  to service_role;

