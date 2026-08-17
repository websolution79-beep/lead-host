-- Date-filtered read model for Team member analytics and CSV exports.

create or replace function public.get_team_member_earnings_report(
  p_member_id uuid,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_event_type text default null,
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
      p_date_from as date_from,
      p_date_to as date_to,
      nullif(trim(p_event_type), '') as event_type_filter,
      greatest(1, p_page) as page_number,
      greatest(1, least(p_page_size, 100)) as page_size
  ),
  filtered_events as (
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
    cross join parameters params
    left join public.profiles pm on pm.id = event.property_manager_profile_id
    left join public.leads lead on lead.id = event.lead_id
    where event.member_id = p_member_id
      and (params.date_from is null or event.occurred_at >= params.date_from)
      and (params.date_to is null or event.occurred_at < params.date_to)
      and (
        params.event_type_filter is null
        or event.event_type = params.event_type_filter
      )
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
      ), 0)::bigint as net_accrued_cents,
      coalesce(sum(paid_cents) filter (
        where status = 'accrued' and amount_cents > 0
      ), 0)::bigint as paid_cents
    from filtered_events
  ),
  paged_events as (
    select event.*
    from filtered_events event
    cross join parameters params
    order by event.occurred_at desc, event.id desc
    limit (select page_size from parameters)
    offset (
      ((select page_number from parameters) - 1)
      * (select page_size from parameters)
    )
  ),
  filtered_payouts as (
    select payout.*
    from public.team_compensation_payouts payout
    cross join parameters params
    where payout.member_id = p_member_id
      and (params.date_from is null or payout.paid_at >= params.date_from)
      and (params.date_to is null or payout.paid_at < params.date_to)
    order by payout.paid_at desc, payout.created_at desc
    limit 100
  )
  select jsonb_build_object(
    'range', jsonb_build_object(
      'dateFrom', (select date_from from parameters),
      'dateTo', (select date_to from parameters),
      'eventType', (select event_type_filter from parameters)
    ),
    'summary', jsonb_build_object(
      'eventCount', summary.event_count,
      'grossAccruedCents', summary.gross_accrued_cents,
      'adjustmentsCents', summary.adjustments_cents,
      'netAccruedCents', summary.net_accrued_cents,
      'paidCents', summary.paid_cents,
      'dueCents', greatest(summary.net_accrued_cents - summary.paid_cents, 0)
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
      from filtered_payouts payout
    ), '[]'::jsonb),
    'pagination', jsonb_build_object(
      'page', (select page_number from parameters),
      'pageSize', (select page_size from parameters),
      'totalItems', (select count(*) from filtered_events),
      'totalPages', greatest(1, ceil(
        (select count(*) from filtered_events)::numeric
        / (select page_size from parameters)
      )::integer)
    )
  )
  from summary;
$$;

revoke execute on function public.get_team_member_earnings_report(
  uuid, timestamptz, timestamptz, text, integer, integer
) from public, anon, authenticated;

grant execute on function public.get_team_member_earnings_report(
  uuid, timestamptz, timestamptz, text, integer, integer
) to service_role;

