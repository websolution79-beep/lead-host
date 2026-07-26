do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'pm_marketing_consent_status'
  ) then
    create type pm_marketing_consent_status as enum (
      'granted',
      'not_granted',
      'withdrawn'
    );
  end if;

  if not exists (
    select 1 from pg_type where typname = 'brevo_outbox_status'
  ) then
    create type brevo_outbox_status as enum (
      'pending',
      'processing',
      'retry',
      'completed',
      'dead_letter',
      'cancelled'
    );
  end if;
end
$$;

create table if not exists pm_marketing_preferences (
  profile_id uuid primary key references profiles(id) on delete cascade,
  status pm_marketing_consent_status not null default 'not_granted',
  source text not null,
  policy_version text not null,
  granted_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pm_marketing_preferences_timestamps_check check (
    (status = 'granted' and granted_at is not null and withdrawn_at is null)
    or (status = 'withdrawn' and withdrawn_at is not null)
    or (status = 'not_granted' and granted_at is null)
  )
);

create table if not exists pm_marketing_consent_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  status pm_marketing_consent_status not null,
  source text not null,
  policy_version text not null,
  external_event_id text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists pm_marketing_consent_external_event_unique
  on pm_marketing_consent_events (external_event_id)
  where external_event_id is not null;

create index if not exists pm_marketing_consent_profile_created_idx
  on pm_marketing_consent_events (profile_id, created_at desc);

create table if not exists pm_brevo_snapshots (
  profile_id uuid primary key references profiles(id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  registered_at timestamptz not null,
  last_access_at timestamptz,
  account_status text not null,
  marketing_consent_status pm_marketing_consent_status not null,
  marketing_consent_updated_at timestamptz not null,
  wallet_balance_cents integer not null default 0,
  has_wallet_topup boolean not null default false,
  first_wallet_topup_at timestamptz,
  last_wallet_topup_at timestamptz,
  wallet_topups_count integer not null default 0,
  wallet_topups_total_cents bigint not null default 0,
  lead_purchases_count integer not null default 0,
  first_lead_purchase_at timestamptz,
  last_lead_purchase_at timestamptz,
  lead_spend_gross_cents bigint not null default 0,
  wallet_refunds_total_cents bigint not null default 0,
  lead_spend_net_cents bigint not null default 0,
  lifecycle_status text not null,
  updated_at timestamptz not null default now()
);

create index if not exists pm_brevo_snapshots_lifecycle_idx
  on pm_brevo_snapshots (lifecycle_status, updated_at desc);

create table if not exists brevo_outbox (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  event_type text not null,
  event_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status brevo_outbox_status not null default 'pending',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  last_http_status integer,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brevo_outbox_attempts_check check (attempts >= 0)
);

create index if not exists brevo_outbox_claim_idx
  on brevo_outbox (status, available_at, created_at)
  where status in ('pending', 'retry');

create index if not exists brevo_outbox_profile_created_idx
  on brevo_outbox (profile_id, created_at desc);

create or replace function enqueue_brevo_outbox_event(
  p_profile_id uuid,
  p_event_type text,
  p_event_key text,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into brevo_outbox (
    profile_id,
    event_type,
    event_key,
    payload
  ) values (
    p_profile_id,
    p_event_type,
    p_event_key,
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (event_key) do nothing
  returning id into v_id;

  if v_id is null then
    select id
    into v_id
    from brevo_outbox
    where event_key = p_event_key;
  end if;

  return v_id;
end;
$$;

create or replace function refresh_pm_brevo_snapshot(p_profile_id uuid)
returns pm_brevo_snapshots
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_snapshot pm_brevo_snapshots;
begin
  insert into pm_brevo_snapshots (
    profile_id,
    email,
    first_name,
    last_name,
    registered_at,
    last_access_at,
    account_status,
    marketing_consent_status,
    marketing_consent_updated_at,
    wallet_balance_cents,
    has_wallet_topup,
    first_wallet_topup_at,
    last_wallet_topup_at,
    wallet_topups_count,
    wallet_topups_total_cents,
    lead_purchases_count,
    first_lead_purchase_at,
    last_lead_purchase_at,
    lead_spend_gross_cents,
    wallet_refunds_total_cents,
    lead_spend_net_cents,
    lifecycle_status,
    updated_at
  )
  select
    p.id,
    p.email,
    p.first_name,
    p.last_name,
    p.created_at,
    au.last_sign_in_at,
    case
      when p.status = 'suspended' or pm.verification_status = 'suspended'
        then 'suspended'
      else 'active'
    end,
    coalesce(pref.status, 'not_granted'::pm_marketing_consent_status),
    coalesce(pref.updated_at, p.created_at),
    coalesce(w.balance_cents, 0),
    coalesce(ledger.wallet_topups_count, 0) > 0,
    ledger.first_wallet_topup_at,
    ledger.last_wallet_topup_at,
    coalesce(ledger.wallet_topups_count, 0),
    coalesce(ledger.wallet_topups_total_cents, 0),
    coalesce(ledger.lead_purchases_count, 0),
    ledger.first_lead_purchase_at,
    ledger.last_lead_purchase_at,
    coalesce(ledger.lead_spend_gross_cents, 0),
    coalesce(ledger.wallet_refunds_total_cents, 0),
    greatest(
      coalesce(ledger.lead_spend_gross_cents, 0)
        - coalesce(ledger.wallet_refunds_total_cents, 0),
      0
    ),
    case
      when p.status = 'suspended' or pm.verification_status = 'suspended'
        then 'account_suspended'
      when coalesce(ledger.lead_purchases_count, 0) > 1
        then 'repeat_customer'
      when coalesce(ledger.lead_purchases_count, 0) = 1
        then 'first_lead_purchased'
      when coalesce(ledger.wallet_topups_count, 0) > 0
        then 'wallet_funded_no_purchase'
      else 'registered_no_wallet'
    end,
    now()
  from profiles p
  join property_manager_profiles pm
    on pm.profile_id = p.id
  left join auth.users au
    on au.id = p.auth_user_id
  left join pm_marketing_preferences pref
    on pref.profile_id = p.id
  left join wallets w
    on w.profile_id = p.id
  left join lateral (
    select
      count(*) filter (
        where wt.type = 'top_up' and wt.status = 'completed'
      )::integer as wallet_topups_count,
      coalesce(sum(wt.amount_cents) filter (
        where wt.type = 'top_up' and wt.status = 'completed'
      ), 0)::bigint as wallet_topups_total_cents,
      min(wt.completed_at) filter (
        where wt.type = 'top_up' and wt.status = 'completed'
      ) as first_wallet_topup_at,
      max(wt.completed_at) filter (
        where wt.type = 'top_up' and wt.status = 'completed'
      ) as last_wallet_topup_at,
      count(distinct wt.lead_purchase_id) filter (
        where wt.type = 'lead_purchase' and wt.status = 'completed'
      )::integer as lead_purchases_count,
      min(wt.completed_at) filter (
        where wt.type = 'lead_purchase' and wt.status = 'completed'
      ) as first_lead_purchase_at,
      max(wt.completed_at) filter (
        where wt.type = 'lead_purchase' and wt.status = 'completed'
      ) as last_lead_purchase_at,
      coalesce(sum(abs(wt.amount_cents)) filter (
        where wt.type = 'lead_purchase' and wt.status = 'completed'
      ), 0)::bigint as lead_spend_gross_cents,
      coalesce(sum(wt.amount_cents) filter (
        where wt.type = 'refund' and wt.status = 'completed'
      ), 0)::bigint as wallet_refunds_total_cents
    from wallet_transactions wt
    where wt.profile_id = p.id
  ) ledger on true
  where p.id = p_profile_id
  on conflict (profile_id) do update
  set
    email = excluded.email,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    registered_at = excluded.registered_at,
    last_access_at = excluded.last_access_at,
    account_status = excluded.account_status,
    marketing_consent_status = excluded.marketing_consent_status,
    marketing_consent_updated_at = excluded.marketing_consent_updated_at,
    wallet_balance_cents = excluded.wallet_balance_cents,
    has_wallet_topup = excluded.has_wallet_topup,
    first_wallet_topup_at = excluded.first_wallet_topup_at,
    last_wallet_topup_at = excluded.last_wallet_topup_at,
    wallet_topups_count = excluded.wallet_topups_count,
    wallet_topups_total_cents = excluded.wallet_topups_total_cents,
    lead_purchases_count = excluded.lead_purchases_count,
    first_lead_purchase_at = excluded.first_lead_purchase_at,
    last_lead_purchase_at = excluded.last_lead_purchase_at,
    lead_spend_gross_cents = excluded.lead_spend_gross_cents,
    wallet_refunds_total_cents = excluded.wallet_refunds_total_cents,
    lead_spend_net_cents = excluded.lead_spend_net_cents,
    lifecycle_status = excluded.lifecycle_status,
    updated_at = excluded.updated_at
  returning * into v_snapshot;

  return v_snapshot;
end;
$$;

create or replace function record_pm_marketing_consent(
  p_profile_id uuid,
  p_status pm_marketing_consent_status,
  p_source text,
  p_policy_version text,
  p_evidence jsonb default '{}'::jsonb,
  p_external_event_id text default null
)
returns pm_marketing_preferences
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preference pm_marketing_preferences;
  v_now timestamptz := now();
begin
  if not exists (
    select 1
    from property_manager_profiles
    where profile_id = p_profile_id
  ) then
    raise exception 'property_manager_not_found';
  end if;

  if p_external_event_id is not null and exists (
    select 1
    from pm_marketing_consent_events
    where external_event_id = p_external_event_id
  ) then
    select *
    into v_preference
    from pm_marketing_preferences
    where profile_id = p_profile_id;

    return v_preference;
  end if;

  insert into pm_marketing_preferences (
    profile_id,
    status,
    source,
    policy_version,
    granted_at,
    withdrawn_at,
    created_at,
    updated_at
  ) values (
    p_profile_id,
    p_status,
    p_source,
    p_policy_version,
    case when p_status = 'granted' then v_now else null end,
    case when p_status = 'withdrawn' then v_now else null end,
    v_now,
    v_now
  )
  on conflict (profile_id) do update
  set
    status = excluded.status,
    source = excluded.source,
    policy_version = excluded.policy_version,
    granted_at = case
      when excluded.status = 'granted' then v_now
      when excluded.status = 'not_granted' then null
      else pm_marketing_preferences.granted_at
    end,
    withdrawn_at = case
      when excluded.status = 'withdrawn' then v_now
      when excluded.status = 'granted' then null
      when excluded.status = 'not_granted' then null
      else pm_marketing_preferences.withdrawn_at
    end,
    updated_at = v_now
  returning * into v_preference;

  insert into pm_marketing_consent_events (
    profile_id,
    status,
    source,
    policy_version,
    external_event_id,
    evidence,
    created_at
  ) values (
    p_profile_id,
    p_status,
    p_source,
    p_policy_version,
    p_external_event_id,
    coalesce(p_evidence, '{}'::jsonb),
    v_now
  )
  on conflict (external_event_id) where external_event_id is not null
  do nothing;

  perform enqueue_brevo_outbox_event(
    p_profile_id,
    'contact_sync',
    'contact_sync:' || p_profile_id::text || ':consent:' || txid_current()::text,
    jsonb_build_object(
      'reason', 'marketing_consent_changed',
      'consent_status', p_status,
      'source', p_source,
      'occurred_at', v_now
    )
  );

  return v_preference;
end;
$$;

create or replace function claim_brevo_outbox(
  p_worker_id text,
  p_batch_size integer default 25
)
returns setof brevo_outbox
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select id
    from brevo_outbox
    where status in ('pending', 'retry')
      and available_at <= now()
    order by available_at, created_at
    limit greatest(1, least(p_batch_size, 100))
    for update skip locked
  ),
  claimed as (
    update brevo_outbox o
    set
      status = 'processing',
      attempts = o.attempts + 1,
      locked_at = now(),
      locked_by = p_worker_id,
      updated_at = now()
    from candidates c
    where o.id = c.id
    returning o.*
  )
  select * from claimed order by created_at;
$$;

create or replace function requeue_stale_brevo_outbox(
  p_stale_after interval default interval '15 minutes'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update brevo_outbox
  set
    status = 'retry',
    available_at = now(),
    locked_at = null,
    locked_by = null,
    last_error = coalesce(last_error, 'Worker interrotto prima del completamento.'),
    updated_at = now()
  where status = 'processing'
    and locked_at < now() - p_stale_after;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function queue_brevo_reconciliation()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_count integer := 0;
  v_day text := to_char(current_date, 'YYYY-MM-DD');
begin
  for v_profile_id in
    select profile_id
    from property_manager_profiles
    order by profile_id
  loop
    perform enqueue_brevo_outbox_event(
      v_profile_id,
      'contact_sync',
      'contact_sync:' || v_profile_id::text || ':reconcile:' || v_day,
      jsonb_build_object(
        'reason', 'daily_reconciliation',
        'occurred_at', now()
      )
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function brevo_profile_change_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from property_manager_profiles where profile_id = new.id
  ) then
    perform enqueue_brevo_outbox_event(
      new.id,
      'contact_sync',
      'contact_sync:' || new.id::text || ':profile:' || txid_current()::text,
      jsonb_build_object('reason', 'profile_changed', 'occurred_at', now())
    );
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_brevo_sync on profiles;
create trigger profiles_brevo_sync
after update of email, first_name, last_name, status on profiles
for each row execute function brevo_profile_change_trigger();

create or replace function brevo_pm_status_change_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.verification_status = 'suspended'
    and old.verification_status is distinct from new.verification_status
  then
    perform enqueue_brevo_outbox_event(
      new.profile_id,
      'account_suspended',
      'account_suspended:' || new.profile_id::text || ':' || txid_current()::text,
      jsonb_build_object('occurred_at', now())
    );
  else
    perform enqueue_brevo_outbox_event(
      new.profile_id,
      'contact_sync',
      'contact_sync:' || new.profile_id::text || ':pm:' || txid_current()::text,
      jsonb_build_object('reason', 'property_manager_changed', 'occurred_at', now())
    );
  end if;

  return new;
end;
$$;

drop trigger if exists property_manager_profiles_brevo_sync
  on property_manager_profiles;
create trigger property_manager_profiles_brevo_sync
after update of verification_status on property_manager_profiles
for each row execute function brevo_pm_status_change_trigger();

create or replace function brevo_wallet_transaction_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completed_count integer;
  v_payload jsonb;
begin
  if new.status <> 'completed'
    or (tg_op = 'UPDATE' and old.status = 'completed')
  then
    return new;
  end if;

  v_payload := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
    'wallet_transaction_id', new.id,
    'amount_cents', abs(new.amount_cents),
    'occurred_at', coalesce(new.completed_at, new.created_at)
  );

  if new.type = 'top_up' then
    select count(*)
    into v_completed_count
    from wallet_transactions
    where profile_id = new.profile_id
      and type = 'top_up'
      and status = 'completed';

    if v_completed_count = 1 then
      perform enqueue_brevo_outbox_event(
        new.profile_id,
        'first_wallet_topup',
        'first_wallet_topup:' || new.profile_id::text,
        v_payload
      );
    end if;

    perform enqueue_brevo_outbox_event(
      new.profile_id,
      'wallet_recharged',
      'wallet_recharged:' || new.id::text,
      v_payload
    );
  elsif new.type = 'lead_purchase' then
    select count(*)
    into v_completed_count
    from wallet_transactions
    where profile_id = new.profile_id
      and type = 'lead_purchase'
      and status = 'completed';

    if v_completed_count = 1 then
      perform enqueue_brevo_outbox_event(
        new.profile_id,
        'first_lead_purchased',
        'first_lead_purchased:' || new.profile_id::text,
        v_payload
      );
    end if;

    perform enqueue_brevo_outbox_event(
      new.profile_id,
      'lead_purchased',
      'lead_purchased:' || new.id::text,
      v_payload
    );
  elsif new.type = 'refund' then
    perform enqueue_brevo_outbox_event(
      new.profile_id,
      'wallet_refunded',
      'wallet_refunded:' || new.id::text,
      v_payload
    );
  else
    perform enqueue_brevo_outbox_event(
      new.profile_id,
      'contact_sync',
      'contact_sync:' || new.profile_id::text || ':wallet:' || new.id::text,
      v_payload || jsonb_build_object('reason', 'wallet_adjustment')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists wallet_transactions_brevo_sync
  on wallet_transactions;
create trigger wallet_transactions_brevo_sync
after insert or update of status on wallet_transactions
for each row execute function brevo_wallet_transaction_trigger();

create or replace function brevo_auth_last_access_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile_id uuid;
begin
  if new.last_sign_in_at is not distinct from old.last_sign_in_at then
    return new;
  end if;

  select id
  into v_profile_id
  from profiles
  where auth_user_id = new.id;

  if v_profile_id is not null and exists (
    select 1 from property_manager_profiles where profile_id = v_profile_id
  ) then
    perform enqueue_brevo_outbox_event(
      v_profile_id,
      'contact_sync',
      'contact_sync:' || v_profile_id::text || ':access:' || txid_current()::text,
      jsonb_build_object('reason', 'last_access_changed', 'occurred_at', now())
    );
  end if;

  return new;
end;
$$;

drop trigger if exists auth_users_brevo_last_access on auth.users;
create trigger auth_users_brevo_last_access
after update of last_sign_in_at on auth.users
for each row execute function brevo_auth_last_access_trigger();

create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_managed_properties_range text;
  v_marketing_granted boolean;
  v_consent_status pm_marketing_consent_status;
  v_policy_version text;
begin
  v_managed_properties_range :=
    nullif(new.raw_user_meta_data->>'managed_properties_range', '');
  v_marketing_granted :=
    coalesce(new.raw_user_meta_data->>'email_marketing_consent', 'false') = 'true';
  v_consent_status := case
    when v_marketing_granted then 'granted'::pm_marketing_consent_status
    else 'not_granted'::pm_marketing_consent_status
  end;
  v_policy_version := coalesce(
    nullif(new.raw_user_meta_data->>'email_marketing_policy_version', ''),
    '1.0'
  );

  insert into profiles (
    auth_user_id,
    email,
    first_name,
    last_name,
    phone
  )
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data->>'first_name', ''),
    nullif(new.raw_user_meta_data->>'last_name', ''),
    nullif(new.raw_user_meta_data->>'phone', '')
  )
  on conflict (auth_user_id) do update
    set email = excluded.email
  returning id into v_profile_id;

  insert into user_roles (profile_id, role)
  values (v_profile_id, 'property_manager')
  on conflict (profile_id, role) do nothing;

  insert into property_manager_profiles (
    profile_id,
    company_name,
    managed_properties_count,
    managed_properties_range,
    primary_city,
    verification_status
  )
  values (
    v_profile_id,
    null,
    case v_managed_properties_range
      when 'starting_now' then 0
      when 'one_to_three' then 3
      when 'four_to_ten' then 10
      when 'more_than_ten' then 11
      else null
    end,
    v_managed_properties_range,
    nullif(new.raw_user_meta_data->>'primary_city', ''),
    'verified'
  )
  on conflict (profile_id) do update
    set managed_properties_count = coalesce(
          excluded.managed_properties_count,
          property_manager_profiles.managed_properties_count
        ),
        managed_properties_range = coalesce(
          excluded.managed_properties_range,
          property_manager_profiles.managed_properties_range
        ),
        primary_city = coalesce(
          excluded.primary_city,
          property_manager_profiles.primary_city
        );

  perform ensure_wallet(v_profile_id);

  insert into pm_marketing_preferences (
    profile_id,
    status,
    source,
    policy_version,
    granted_at,
    withdrawn_at
  ) values (
    v_profile_id,
    v_consent_status,
    'pm_registration',
    v_policy_version,
    case when v_marketing_granted then now() else null end,
    null
  )
  on conflict (profile_id) do nothing;

  insert into pm_marketing_consent_events (
    profile_id,
    status,
    source,
    policy_version,
    evidence
  ) values (
    v_profile_id,
    v_consent_status,
    'pm_registration',
    v_policy_version,
    jsonb_build_object(
      'auth_user_id', new.id,
      'explicit_checkbox', v_marketing_granted
    )
  );

  perform enqueue_brevo_outbox_event(
    v_profile_id,
    'user_registered',
    'user_registered:' || v_profile_id::text,
    jsonb_build_object(
      'occurred_at', now(),
      'marketing_consent_status', v_consent_status
    )
  );

  return new;
end;
$$;

insert into pm_marketing_preferences (
  profile_id,
  status,
  source,
  policy_version,
  granted_at,
  withdrawn_at
)
select
  pm.profile_id,
  'not_granted'::pm_marketing_consent_status,
  'historical_backfill',
  '1.0',
  null,
  null
from property_manager_profiles pm
on conflict (profile_id) do nothing;

insert into pm_marketing_consent_events (
  profile_id,
  status,
  source,
  policy_version,
  evidence
)
select
  pref.profile_id,
  pref.status,
  pref.source,
  pref.policy_version,
  jsonb_build_object('backfilled', true)
from pm_marketing_preferences pref
where not exists (
  select 1
  from pm_marketing_consent_events history
  where history.profile_id = pref.profile_id
);

do $$
declare
  v_profile_id uuid;
begin
  for v_profile_id in
    select profile_id
    from property_manager_profiles
  loop
    perform enqueue_brevo_outbox_event(
      v_profile_id,
      'contact_sync',
      'contact_sync:' || v_profile_id::text || ':historical_backfill',
      jsonb_build_object(
        'reason', 'historical_backfill',
        'occurred_at', now()
      )
    );
  end loop;
end
$$;

alter table pm_marketing_preferences enable row level security;
alter table pm_marketing_consent_events enable row level security;
alter table pm_brevo_snapshots enable row level security;
alter table brevo_outbox enable row level security;

drop policy if exists "pm_marketing_preferences_select_own_or_admin"
  on pm_marketing_preferences;
create policy "pm_marketing_preferences_select_own_or_admin"
on pm_marketing_preferences for select
to authenticated
using (profile_id = current_profile_id() or is_super_admin());

drop policy if exists "pm_marketing_consent_events_select_own_or_admin"
  on pm_marketing_consent_events;
create policy "pm_marketing_consent_events_select_own_or_admin"
on pm_marketing_consent_events for select
to authenticated
using (profile_id = current_profile_id() or is_super_admin());

drop policy if exists "pm_brevo_snapshots_select_own_or_admin"
  on pm_brevo_snapshots;
create policy "pm_brevo_snapshots_select_own_or_admin"
on pm_brevo_snapshots for select
to authenticated
using (profile_id = current_profile_id() or is_super_admin());

drop policy if exists "brevo_outbox_admin_select" on brevo_outbox;
create policy "brevo_outbox_admin_select"
on brevo_outbox for select
to authenticated
using (is_super_admin());

revoke all on pm_marketing_preferences from anon, authenticated;
revoke all on pm_marketing_consent_events from anon, authenticated;
revoke all on pm_brevo_snapshots from anon, authenticated;
revoke all on brevo_outbox from anon, authenticated;

grant select on pm_marketing_preferences to authenticated;
grant select on pm_marketing_consent_events to authenticated;
grant select on pm_brevo_snapshots to authenticated;
grant select on brevo_outbox to authenticated;

revoke execute on function enqueue_brevo_outbox_event(
  uuid, text, text, jsonb
) from public, anon, authenticated;
revoke execute on function refresh_pm_brevo_snapshot(uuid)
  from public, anon, authenticated;
revoke execute on function record_pm_marketing_consent(
  uuid, pm_marketing_consent_status, text, text, jsonb, text
) from public, anon, authenticated;
revoke execute on function claim_brevo_outbox(text, integer)
  from public, anon, authenticated;
revoke execute on function requeue_stale_brevo_outbox(interval)
  from public, anon, authenticated;
revoke execute on function queue_brevo_reconciliation()
  from public, anon, authenticated;

grant execute on function enqueue_brevo_outbox_event(
  uuid, text, text, jsonb
) to service_role;
grant execute on function refresh_pm_brevo_snapshot(uuid)
  to service_role;
grant execute on function record_pm_marketing_consent(
  uuid, pm_marketing_consent_status, text, text, jsonb, text
) to service_role;
grant execute on function claim_brevo_outbox(text, integer)
  to service_role;
grant execute on function requeue_stale_brevo_outbox(interval)
  to service_role;
grant execute on function queue_brevo_reconciliation()
  to service_role;
