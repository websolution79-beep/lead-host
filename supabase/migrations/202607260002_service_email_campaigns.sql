create table if not exists service_email_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  preview text not null default '',
  title text not null,
  body text not null,
  extra text not null default '',
  cta_label text not null default '',
  cta_url text not null default '',
  recipient_scope text not null default 'active_property_managers'
    check (recipient_scope in ('active_property_managers')),
  status text not null default 'draft'
    check (
      status in (
        'draft',
        'queued',
        'processing',
        'completed',
        'completed_with_errors',
        'failed',
        'cancelled'
      )
    ),
  total_recipients integer not null default 0 check (total_recipients >= 0),
  pending_count integer not null default 0 check (pending_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  created_by uuid references profiles(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists service_email_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references service_email_campaigns(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  recipient_email text not null,
  first_name text,
  last_name text,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'retry', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, profile_id)
);

create index if not exists service_email_campaigns_status_created_idx
  on service_email_campaigns (status, created_at desc);

create index if not exists service_email_recipients_claim_idx
  on service_email_recipients (status, available_at, created_at)
  where status in ('queued', 'retry');

create index if not exists service_email_recipients_campaign_status_idx
  on service_email_recipients (campaign_id, status, created_at);

drop trigger if exists service_email_campaigns_updated_at
  on service_email_campaigns;
create trigger service_email_campaigns_updated_at
before update on service_email_campaigns
for each row execute function set_updated_at();

drop trigger if exists service_email_recipients_updated_at
  on service_email_recipients;
create trigger service_email_recipients_updated_at
before update on service_email_recipients
for each row execute function set_updated_at();

create or replace function queue_service_email_campaign(p_campaign_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_recipient_count integer;
begin
  select status
  into v_status
  from service_email_campaigns
  where id = p_campaign_id
  for update;

  if not found then
    raise exception 'Campagna email di servizio non trovata.';
  end if;

  if v_status <> 'draft' then
    raise exception 'La campagna non e in stato bozza.';
  end if;

  insert into service_email_recipients (
    campaign_id,
    profile_id,
    recipient_email,
    first_name,
    last_name
  )
  select
    p_campaign_id,
    p.id,
    lower(trim(p.email)),
    p.first_name,
    p.last_name
  from profiles p
  join user_roles ur
    on ur.profile_id = p.id
   and ur.role = 'property_manager'
  join property_manager_profiles pm
    on pm.profile_id = p.id
  where p.status = 'active'
    and pm.verification_status <> 'suspended'
    and nullif(trim(p.email), '') is not null
  on conflict (campaign_id, profile_id) do nothing;

  get diagnostics v_recipient_count = row_count;

  update service_email_campaigns
  set
    status = case when v_recipient_count > 0 then 'queued' else 'failed' end,
    total_recipients = v_recipient_count,
    pending_count = v_recipient_count,
    started_at = case when v_recipient_count > 0 then now() else null end,
    completed_at = case when v_recipient_count = 0 then now() else null end
  where id = p_campaign_id;

  return v_recipient_count;
end;
$$;

create or replace function requeue_stale_service_email_recipients(
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
  update service_email_recipients
  set
    status = 'retry',
    available_at = now(),
    locked_at = null,
    locked_by = null,
    last_error = coalesce(last_error, 'Elaborazione interrotta: nuovo tentativo.')
  where status = 'processing'
    and locked_at < now() - p_stale_after;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function claim_service_email_recipients(
  p_worker_id text,
  p_batch_size integer default 100
)
returns setof service_email_recipients
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select id
    from service_email_recipients
    where status in ('queued', 'retry')
      and available_at <= now()
    order by created_at
    for update skip locked
    limit greatest(1, least(p_batch_size, 100))
  )
  update service_email_recipients recipient
  set
    status = 'processing',
    attempts = recipient.attempts + 1,
    locked_at = now(),
    locked_by = p_worker_id
  from candidates
  where recipient.id = candidates.id
  returning recipient.*;
end;
$$;

create or replace function refresh_service_email_campaign(
  p_campaign_id uuid
)
returns service_email_campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_pending integer;
  v_sent integer;
  v_failed integer;
  v_campaign service_email_campaigns;
begin
  select
    count(*)::integer,
    count(*) filter (
      where status in ('queued', 'processing', 'retry')
    )::integer,
    count(*) filter (where status = 'sent')::integer,
    count(*) filter (where status in ('failed', 'skipped'))::integer
  into v_total, v_pending, v_sent, v_failed
  from service_email_recipients
  where campaign_id = p_campaign_id;

  update service_email_campaigns
  set
    total_recipients = v_total,
    pending_count = v_pending,
    sent_count = v_sent,
    failed_count = v_failed,
    status = case
      when status = 'cancelled' then 'cancelled'
      when v_pending > 0 then 'processing'
      when v_total = 0 then 'failed'
      when v_failed = v_total then 'failed'
      when v_failed > 0 then 'completed_with_errors'
      else 'completed'
    end,
    completed_at = case
      when v_pending = 0 then coalesce(completed_at, now())
      else null
    end
  where id = p_campaign_id
  returning * into v_campaign;

  return v_campaign;
end;
$$;

create or replace function complete_service_email_batch(
  p_campaign_id uuid,
  p_results jsonb
)
returns service_email_campaigns
language plpgsql
security definer
set search_path = public
as $$
begin
  update service_email_recipients recipient
  set
    status = 'sent',
    provider_message_id = result.item ->> 'provider_message_id',
    sent_at = now(),
    locked_at = null,
    locked_by = null,
    last_error = null
  from jsonb_array_elements(p_results) as result(item)
  where recipient.id = (result.item ->> 'recipient_id')::uuid
    and recipient.campaign_id = p_campaign_id
    and recipient.status = 'processing';

  return refresh_service_email_campaign(p_campaign_id);
end;
$$;

create or replace function fail_service_email_batch(
  p_campaign_id uuid,
  p_recipient_ids uuid[],
  p_error text,
  p_max_attempts integer default 5
)
returns service_email_campaigns
language plpgsql
security definer
set search_path = public
as $$
begin
  update service_email_recipients
  set
    status = case when attempts >= p_max_attempts then 'failed' else 'retry' end,
    available_at = case
      when attempts >= p_max_attempts then available_at
      else now() + make_interval(
        secs => least(
          21600,
          (30 * power(2, greatest(attempts - 1, 0)))::integer
        )
      )
    end,
    locked_at = null,
    locked_by = null,
    last_error = left(p_error, 2000)
  where campaign_id = p_campaign_id
    and id = any(p_recipient_ids)
    and status = 'processing';

  return refresh_service_email_campaign(p_campaign_id);
end;
$$;

alter table service_email_campaigns enable row level security;
alter table service_email_recipients enable row level security;

drop policy if exists "service_email_campaigns_admin_select"
  on service_email_campaigns;
create policy "service_email_campaigns_admin_select"
on service_email_campaigns for select
to authenticated
using (is_super_admin());

drop policy if exists "service_email_recipients_admin_select"
  on service_email_recipients;
create policy "service_email_recipients_admin_select"
on service_email_recipients for select
to authenticated
using (is_super_admin());

revoke all on service_email_campaigns from anon, authenticated;
revoke all on service_email_recipients from anon, authenticated;
grant select on service_email_campaigns to authenticated;
grant select on service_email_recipients to authenticated;

revoke execute on function queue_service_email_campaign(uuid)
  from public, anon, authenticated;
revoke execute on function requeue_stale_service_email_recipients(interval)
  from public, anon, authenticated;
revoke execute on function claim_service_email_recipients(text, integer)
  from public, anon, authenticated;
revoke execute on function refresh_service_email_campaign(uuid)
  from public, anon, authenticated;
revoke execute on function complete_service_email_batch(uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function fail_service_email_batch(uuid, uuid[], text, integer)
  from public, anon, authenticated;

grant execute on function queue_service_email_campaign(uuid) to service_role;
grant execute on function requeue_stale_service_email_recipients(interval)
  to service_role;
grant execute on function claim_service_email_recipients(text, integer)
  to service_role;
grant execute on function refresh_service_email_campaign(uuid) to service_role;
grant execute on function complete_service_email_batch(uuid, jsonb)
  to service_role;
grant execute on function fail_service_email_batch(uuid, uuid[], text, integer)
  to service_role;
