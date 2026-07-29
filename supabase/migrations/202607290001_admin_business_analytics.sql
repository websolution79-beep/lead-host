-- Period-aware, scalable analytics for the Super Admin area.
-- All calendar boundaries are interpreted in Europe/Rome.

create index if not exists owner_requests_created_status_idx
  on owner_requests (created_at desc, status);

create index if not exists wallet_transactions_type_status_completed_idx
  on wallet_transactions (type, status, completed_at desc, created_at desc);

create index if not exists lead_purchases_mode_status_created_idx
  on lead_purchases (mode, status, created_at desc);

create or replace function admin_analytics_period_metrics(
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with
  period_requests as (
    select id, status
    from owner_requests
    where created_at >= p_from and created_at < p_to
  ),
  period_published as (
    select
      leads.id,
      leads.owner_request_id,
      leads.published_at,
      leads.internal_status
    from leads
    where leads.published_at >= p_from and leads.published_at < p_to
  ),
  gross_purchases as (
    select
      lead_purchases.id,
      lead_purchases.lead_id,
      lead_purchases.property_manager_id,
      lead_purchases.mode,
      lead_purchases.amount_cents,
      lead_purchases.created_at
    from lead_purchases
    where lead_purchases.status in ('paid', 'contact_unlocked', 'refunded')
      and lead_purchases.created_at >= p_from
      and lead_purchases.created_at < p_to
  ),
  buyer_counts as (
    select property_manager_id, count(*)::integer as purchase_count
    from gross_purchases
    group by property_manager_id
  ),
  all_completed_topups as (
    select
      wallet_transactions.id,
      wallet_transactions.profile_id,
      wallet_transactions.amount_cents,
      coalesce(
        wallet_transactions.completed_at,
        wallet_transactions.created_at
      ) as occurred_at,
      row_number() over (
        partition by wallet_transactions.profile_id
        order by coalesce(
          wallet_transactions.completed_at,
          wallet_transactions.created_at
        ), wallet_transactions.id
      ) as topup_number
    from wallet_transactions
    where wallet_transactions.type = 'top_up'
      and wallet_transactions.status = 'completed'
  ),
  period_topups as (
    select *
    from all_completed_topups
    where occurred_at >= p_from and occurred_at < p_to
  ),
  period_refunds as (
    select
      wallet_transactions.id,
      wallet_transactions.profile_id,
      wallet_transactions.amount_cents,
      coalesce(
        wallet_transactions.completed_at,
        wallet_transactions.created_at
      ) as occurred_at
    from wallet_transactions
    where wallet_transactions.type = 'refund'
      and wallet_transactions.status = 'completed'
      and coalesce(
        wallet_transactions.completed_at,
        wallet_transactions.created_at
      ) >= p_from
      and coalesce(
        wallet_transactions.completed_at,
        wallet_transactions.created_at
      ) < p_to
  ),
  first_purchase_by_lead as (
    select
      lead_purchases.lead_id,
      min(lead_purchases.created_at) as first_purchase_at
    from lead_purchases
    where lead_purchases.status in ('paid', 'contact_unlocked', 'refunded')
    group by lead_purchases.lead_id
  ),
  cohort_published as (
    select leads.id, leads.published_at, leads.internal_status
    from period_requests
    join leads on leads.owner_request_id = period_requests.id
    where leads.published_at is not null
  ),
  cohort_with_purchase as (
    select distinct cohort_published.id
    from cohort_published
    join lead_purchases on lead_purchases.lead_id = cohort_published.id
    where lead_purchases.status in ('paid', 'contact_unlocked', 'refunded')
  ),
  new_pm_cohort as (
    select property_manager_profiles.id
    from property_manager_profiles
    where property_manager_profiles.created_at >= p_from
      and property_manager_profiles.created_at < p_to
  ),
  new_pm_buyers as (
    select distinct new_pm_cohort.id
    from new_pm_cohort
    join lead_purchases
      on lead_purchases.property_manager_id = new_pm_cohort.id
    where lead_purchases.status in ('paid', 'contact_unlocked', 'refunded')
  )
  select jsonb_build_object(
    'ownerRequests', (select count(*) from period_requests),
    'completedRequests', (
      select count(*)
      from period_requests
      where status not in ('new_from_meta', 'waiting_for_completion')
    ),
    'pendingRequests', (
      select count(*)
      from period_requests
      where status::text in ('pending', 'to_verify')
    ),
    'publishedLeads', (select count(*) from period_published),
    'rejectedLeads', (
      select count(*)
      from period_requests
      where status = 'not_publishable'
    ),
    'expiredLeads', (
      select count(*)
      from leads
      where internal_status = 'withdrawn_after_7_days'
        and expires_at >= p_from
        and expires_at < p_to
    ),
    'soldLeads', (select count(distinct lead_id) from gross_purchases),
    'exhaustedLeads', (
      select count(*)
      from cohort_published
      where internal_status in ('sold_two_pm', 'sold_exclusive')
    ),
    'purchases', (select count(*) from gross_purchases),
    'sharedPurchases', (
      select count(*) from gross_purchases where mode = 'shared'
    ),
    'exclusivePurchases', (
      select count(*) from gross_purchases where mode = 'exclusive'
    ),
    'purchaseValueCents', coalesce((
      select sum(amount_cents) from gross_purchases
    ), 0),
    'sharedValueCents', coalesce((
      select sum(amount_cents)
      from gross_purchases
      where mode = 'shared'
    ), 0),
    'exclusiveValueCents', coalesce((
      select sum(amount_cents)
      from gross_purchases
      where mode = 'exclusive'
    ), 0),
    'uniqueBuyers', (
      select count(distinct property_manager_id) from gross_purchases
    ),
    'averagePurchaseCents', coalesce((
      select round(avg(amount_cents)) from gross_purchases
    ), 0),
    'averageRevenuePerLeadCents', coalesce((
      select round(
        sum(amount_cents)::numeric / nullif(count(distinct lead_id), 0)
      )
      from gross_purchases
    ), 0),
    'averagePurchasesPerBuyer', coalesce((
      select round(
        count(*)::numeric / nullif(count(distinct property_manager_id), 0),
        2
      )
      from gross_purchases
    ), 0),
    'repeatBuyerRate', coalesce((
      select round(
        100 * count(*) filter (where purchase_count >= 2)::numeric
        / nullif(count(*), 0),
        1
      )
      from buyer_counts
    ), 0),
    'topUpCount', (select count(*) from period_topups),
    'topUpCents', coalesce((
      select sum(amount_cents) from period_topups
    ), 0),
    'uniqueTopUpPms', (
      select count(distinct profile_id) from period_topups
    ),
    'averageTopUpCents', coalesce((
      select round(avg(amount_cents)) from period_topups
    ), 0),
    'firstTopUps', (
      select count(*) from period_topups where topup_number = 1
    ),
    'repeatTopUps', (
      select count(*) from period_topups where topup_number > 1
    ),
    'refundCount', (select count(*) from period_refunds),
    'refundCents', coalesce((
      select sum(amount_cents) from period_refunds
    ), 0),
    'netLeadValueCents', greatest(
      coalesce((select sum(amount_cents) from gross_purchases), 0)
      - coalesce((select sum(amount_cents) from period_refunds), 0),
      0
    ),
    'newPropertyManagers', (select count(*) from new_pm_cohort),
    'newPmBuyerRate', coalesce((
      select round(
        100 * (select count(*) from new_pm_buyers)::numeric
        / nullif((select count(*) from new_pm_cohort), 0),
        1
      )
    ), 0),
    'publicationRate', coalesce((
      select round(
        100 * (select count(*) from cohort_published)::numeric
        / nullif((select count(*) from period_requests), 0),
        1
      )
    ), 0),
    'invalidRate', coalesce((
      select round(
        100 * count(*) filter (where status = 'not_publishable')::numeric
        / nullif(count(*), 0),
        1
      )
      from period_requests
    ), 0),
    'sellThroughRate', coalesce((
      select round(
        100 * (select count(*) from cohort_with_purchase)::numeric
        / nullif((select count(*) from cohort_published), 0),
        1
      )
    ), 0),
    'averagePublishHours', coalesce((
      select round(avg(
        extract(epoch from (leads.published_at - owner_requests.created_at))
        / 3600
      )::numeric, 1)
      from period_published
      join owner_requests
        on owner_requests.id = period_published.owner_request_id
      join leads on leads.id = period_published.id
    ), 0),
    'averageFirstPurchaseHours', coalesce((
      select round(avg(
        extract(epoch from (
          first_purchase_by_lead.first_purchase_at
          - cohort_published.published_at
        )) / 3600
      )::numeric, 1)
      from cohort_published
      join first_purchase_by_lead
        on first_purchase_by_lead.lead_id = cohort_published.id
      where first_purchase_by_lead.first_purchase_at
        >= cohort_published.published_at
    ), 0)
  );
$$;

revoke all on function admin_analytics_period_metrics(timestamptz, timestamptz)
  from public, anon, authenticated;

create or replace function get_admin_business_analytics(
  p_from_date date,
  p_to_date date,
  p_previous_from_date date,
  p_previous_to_date date,
  p_bucket text default 'day'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz;
  v_to timestamptz;
  v_previous_from timestamptz;
  v_previous_to timestamptz;
  v_step interval;
  v_is_admin boolean;
  v_current jsonb;
  v_previous jsonb;
  v_snapshot jsonb;
  v_trends jsonb;
  v_funnel jsonb;
  v_dimensions jsonb;
  v_operations jsonb;
  v_recent_activity jsonb;
begin
  select
    coalesce(auth.role() = 'service_role', false)
    or exists (
      select 1
      from profiles
      join user_roles on user_roles.profile_id = profiles.id
      where profiles.auth_user_id = auth.uid()
        and profiles.status = 'active'
        and user_roles.role = 'super_admin'
    )
  into v_is_admin;

  if not v_is_admin then
    raise exception 'admin_access_required';
  end if;

  if p_to_date <= p_from_date
    or p_previous_to_date <= p_previous_from_date then
    raise exception 'invalid_analytics_period';
  end if;

  if p_bucket not in ('day', 'month') then
    raise exception 'invalid_analytics_bucket';
  end if;

  v_from := p_from_date::timestamp at time zone 'Europe/Rome';
  v_to := p_to_date::timestamp at time zone 'Europe/Rome';
  v_previous_from :=
    p_previous_from_date::timestamp at time zone 'Europe/Rome';
  v_previous_to :=
    p_previous_to_date::timestamp at time zone 'Europe/Rome';
  v_step := case when p_bucket = 'month'
    then interval '1 month'
    else interval '1 day'
  end;

  v_current := admin_analytics_period_metrics(v_from, v_to);
  v_previous := admin_analytics_period_metrics(v_previous_from, v_previous_to);

  select jsonb_build_object(
    'walletBalanceCents', coalesce((
      select sum(balance_cents) from wallets
    ), 0),
    'pendingReview', (
      select count(*)
      from owner_requests
      where status::text in ('pending', 'to_verify')
    ),
    'waitingCompletion', (
      select count(*)
      from owner_requests
      where status in ('new_from_meta', 'waiting_for_completion')
    ),
    'duplicateWarnings', (
      select count(*)
      from owner_requests
      where duplicate_check ->> 'status'
        in ('duplicate', 'possible_duplicate')
    ),
    'availableLeads', (
      select count(*)
      from leads
      where published_at is not null
        and public_status in ('available', 'last_availability')
        and (visible_until is null or visible_until > now())
    ),
    'expiringSoon', (
      select count(*)
      from leads
      where published_at is not null
        and public_status in ('available', 'last_availability')
        and expires_at > now()
        and expires_at <= now() + interval '24 hours'
    ),
    'supportAwaitingAdmin', (
      select count(*)
      from reports
      where reports.status in ('pending', 'reviewing')
        and coalesce((
          select support_messages.sender_type
          from support_messages
          where support_messages.report_id = reports.id
          order by support_messages.created_at desc
          limit 1
        ), 'pm') = 'pm'
    ),
    'pendingRefunds', (
      select count(*)
      from refunds
      where status in ('pending', 'approved')
    ),
    'invoicesToManage', (
      select count(*)
      from billing_invoices
      where status in ('pending', 'error')
    ),
    'activePropertyManagers', (
      select count(*)
      from property_manager_profiles
      join profiles
        on profiles.id = property_manager_profiles.profile_id
      where profiles.status = 'active'
        and property_manager_profiles.verification_status <> 'suspended'
    )
  )
  into v_snapshot;

  with
  buckets as (
    select generate_series(
      date_trunc(p_bucket, v_from at time zone 'Europe/Rome'),
      date_trunc(
        p_bucket,
        (v_to - interval '1 microsecond') at time zone 'Europe/Rome'
      ),
      v_step
    ) as bucket_start
  ),
  request_counts as (
    select
      date_trunc(
        p_bucket,
        owner_requests.created_at at time zone 'Europe/Rome'
      ) as bucket_start,
      count(*)::integer as value
    from owner_requests
    where created_at >= v_from and created_at < v_to
    group by 1
  ),
  publication_counts as (
    select
      date_trunc(
        p_bucket,
        leads.published_at at time zone 'Europe/Rome'
      ) as bucket_start,
      count(*)::integer as value
    from leads
    where published_at >= v_from and published_at < v_to
    group by 1
  ),
  purchase_counts as (
    select
      date_trunc(
        p_bucket,
        lead_purchases.created_at at time zone 'Europe/Rome'
      ) as bucket_start,
      count(*)::integer as value,
      coalesce(sum(lead_purchases.amount_cents), 0)::bigint as amount_cents
    from lead_purchases
    where lead_purchases.status in ('paid', 'contact_unlocked', 'refunded')
      and created_at >= v_from and created_at < v_to
    group by 1
  ),
  topup_counts as (
    select
      date_trunc(
        p_bucket,
        coalesce(
          wallet_transactions.completed_at,
          wallet_transactions.created_at
        ) at time zone 'Europe/Rome'
      ) as bucket_start,
      coalesce(sum(wallet_transactions.amount_cents), 0)::bigint
        as amount_cents
    from wallet_transactions
    where type = 'top_up'
      and status = 'completed'
      and coalesce(completed_at, created_at) >= v_from
      and coalesce(completed_at, created_at) < v_to
    group by 1
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'date', to_char(buckets.bucket_start, 'YYYY-MM-DD'),
      'label', case
        when p_bucket = 'month'
          then to_char(buckets.bucket_start, 'YYYY-MM')
        else to_char(buckets.bucket_start, 'YYYY-MM-DD')
      end,
      'ownerRequests', coalesce(request_counts.value, 0),
      'publishedLeads', coalesce(publication_counts.value, 0),
      'purchases', coalesce(purchase_counts.value, 0),
      'purchaseValueCents', coalesce(purchase_counts.amount_cents, 0),
      'topUpCents', coalesce(topup_counts.amount_cents, 0)
    )
    order by buckets.bucket_start
  ), '[]'::jsonb)
  into v_trends
  from buckets
  left join request_counts using (bucket_start)
  left join publication_counts using (bucket_start)
  left join purchase_counts using (bucket_start)
  left join topup_counts using (bucket_start);

  with
  cohort as (
    select id, status
    from owner_requests
    where created_at >= v_from and created_at < v_to
  ),
  cohort_leads as (
    select leads.id, leads.owner_request_id, leads.internal_status
    from cohort
    join leads on leads.owner_request_id = cohort.id
    where leads.published_at is not null
  )
  select jsonb_build_array(
    jsonb_build_object(
      'key', 'received',
      'label', 'Arrivati',
      'value', (select count(*) from cohort)
    ),
    jsonb_build_object(
      'key', 'completed',
      'label', 'Completati',
      'value', (
        select count(*)
        from cohort
        where status not in ('new_from_meta', 'waiting_for_completion')
      )
    ),
    jsonb_build_object(
      'key', 'published',
      'label', 'Pubblicati',
      'value', (select count(*) from cohort_leads)
    ),
    jsonb_build_object(
      'key', 'purchased',
      'label', 'Acquistati',
      'value', (
        select count(distinct cohort_leads.id)
        from cohort_leads
        join lead_purchases
          on lead_purchases.lead_id = cohort_leads.id
        where lead_purchases.status
          in ('paid', 'contact_unlocked', 'refunded')
      )
    ),
    jsonb_build_object(
      'key', 'exhausted',
      'label', 'Esauriti',
      'value', (
        select count(*)
        from cohort_leads
        where internal_status in ('sold_two_pm', 'sold_exclusive')
      )
    )
  )
  into v_funnel;

  select jsonb_build_object(
    'acquisitionChannels', coalesce((
      select jsonb_agg(row_data order by value desc)
      from (
        select jsonb_build_object(
          'label', acquisition_channel::text,
          'value', count(*)
        ) as row_data, count(*) as value
        from owner_requests
        where created_at >= v_from and created_at < v_to
        group by acquisition_channel
      ) rows
    ), '[]'::jsonb),
    'topCities', coalesce((
      select jsonb_agg(row_data order by value desc)
      from (
        select jsonb_build_object(
          'label', coalesce(properties.city, 'Non indicata'),
          'value', count(*)
        ) as row_data, count(*) as value
        from leads
        join properties on properties.id = leads.property_id
        where leads.published_at >= v_from and leads.published_at < v_to
        group by coalesce(properties.city, 'Non indicata')
        order by value desc
        limit 8
      ) rows
    ), '[]'::jsonb),
    'propertyTypes', coalesce((
      select jsonb_agg(row_data order by value desc)
      from (
        select jsonb_build_object(
          'label', coalesce(properties.property_type, 'Non indicata'),
          'value', count(*)
        ) as row_data, count(*) as value
        from owner_requests
        join properties
          on properties.owner_request_id = owner_requests.id
        where owner_requests.created_at >= v_from
          and owner_requests.created_at < v_to
        group by coalesce(properties.property_type, 'Non indicata')
        order by value desc
        limit 8
      ) rows
    ), '[]'::jsonb),
    'topServices', coalesce((
      select jsonb_agg(row_data order by value desc)
      from (
        select jsonb_build_object(
          'label', service,
          'value', count(*)
        ) as row_data, count(*) as value
        from owner_requests
        join properties
          on properties.owner_request_id = owner_requests.id
        cross join lateral unnest(properties.requested_services) service
        where owner_requests.created_at >= v_from
          and owner_requests.created_at < v_to
        group by service
        order by value desc
        limit 8
      ) rows
    ), '[]'::jsonb)
  )
  into v_dimensions;

  select jsonb_build_object(
    'leadStatuses', coalesce((
      select jsonb_agg(row_data order by value desc)
      from (
        select jsonb_build_object(
          'label', internal_status::text,
          'value', count(*)
        ) as row_data, count(*) as value
        from leads
        where published_at is not null
        group by internal_status
      ) rows
    ), '[]'::jsonb),
    'supportStatuses', coalesce((
      select jsonb_agg(row_data order by value desc)
      from (
        select jsonb_build_object(
          'label', status::text,
          'value', count(*)
        ) as row_data, count(*) as value
        from reports
        group by status
      ) rows
    ), '[]'::jsonb),
    'invoiceStatuses', coalesce((
      select jsonb_agg(row_data order by value desc)
      from (
        select jsonb_build_object(
          'label', status::text,
          'value', count(*)
        ) as row_data, count(*) as value
        from billing_invoices
        group by status
      ) rows
    ), '[]'::jsonb)
  )
  into v_operations;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'type', activity_type,
      'label', activity_label,
      'detail', activity_detail,
      'amountCents', amount_cents,
      'href', href,
      'createdAt', created_at
    )
    order by created_at desc
  ), '[]'::jsonb)
  into v_recent_activity
  from (
    select *
    from (
      select
        'Lead acquisito'::text as activity_type,
        acquisition_channel::text as activity_label,
        status::text as activity_detail,
        null::bigint as amount_cents,
        '/admin/leads'::text as href,
        created_at
      from owner_requests

      union all

      select
        'Acquisto Lead',
        case when mode = 'exclusive' then 'Esclusiva' else 'Condiviso' end,
        status::text,
        amount_cents::bigint,
        '/admin/pagamenti',
        created_at
      from lead_purchases
      where status in ('paid', 'contact_unlocked', 'refunded')

      union all

      select
        'Ricarica wallet',
        coalesce(provider, 'Wallet'),
        status::text,
        amount_cents::bigint,
        '/admin/pagamenti',
        coalesce(completed_at, created_at)
      from wallet_transactions
      where type = 'top_up' and status = 'completed'

      union all

      select
        'Assistenza',
        subject,
        status::text,
        null::bigint,
        '/admin/segnalazioni',
        created_at
      from reports
    ) combined_activity
    order by created_at desc
    limit 10
  ) latest_activity;

  return jsonb_build_object(
    'generatedAt', now(),
    'timezone', 'Europe/Rome',
    'period', jsonb_build_object(
      'fromDate', p_from_date,
      'toDateExclusive', p_to_date,
      'previousFromDate', p_previous_from_date,
      'previousToDateExclusive', p_previous_to_date,
      'bucket', p_bucket
    ),
    'snapshot', v_snapshot,
    'current', v_current,
    'previous', v_previous,
    'trends', v_trends,
    'funnel', v_funnel,
    'dimensions', v_dimensions,
    'operations', v_operations,
    'recentActivity', v_recent_activity
  );
end;
$$;

revoke all on function get_admin_business_analytics(
  date, date, date, date, text
) from public, anon;

grant execute on function get_admin_business_analytics(
  date, date, date, date, text
) to authenticated;
