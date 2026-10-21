begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table if not exists public.marketplace_promotion_email_jobs (
  compensation_event_id uuid primary key references public.team_compensation_events(id) on delete restrict,
  profile_id uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check(status in ('pending','processing','sent','skipped','needs_review')),
  available_at timestamptz not null default clock_timestamp(),
  lease_id uuid,
  locked_at timestamptz,
  first_attempt_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz
);
create index if not exists marketplace_promotion_email_pending_idx
  on public.marketplace_promotion_email_jobs(available_at,created_at) where status in ('pending','processing');
alter table public.marketplace_promotion_email_jobs enable row level security;
revoke all on public.marketplace_promotion_email_jobs from public,anon,authenticated,service_role;
grant select on public.marketplace_promotion_email_jobs to service_role;

create or replace function public.enqueue_marketplace_promotion_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.marketplace_promotion_email_jobs(compensation_event_id,profile_id)
    select new.id,m.profile_id from public.team_members m where m.id=new.member_id
    on conflict(compensation_event_id) do nothing;
  return new;
end;
$$;
revoke all on function public.enqueue_marketplace_promotion_email() from public,anon,authenticated;
drop trigger if exists marketplace_promotion_email_enqueue on public.team_compensation_events;
create trigger marketplace_promotion_email_enqueue after insert on public.team_compensation_events
  for each row when(new.event_type='marketplace_promotion_sale' and new.status='accrued' and new.amount_cents>0)
  execute function public.enqueue_marketplace_promotion_email();

-- No backfill: only new commission events inserted after this migration are queued.
create or replace function public.claim_marketplace_promotion_emails(p_limit integer default 10)
returns table(compensation_event_id uuid,lease_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  update public.marketplace_promotion_email_jobs q set status='pending',lease_id=null,locked_at=null
    where q.status='processing' and q.locked_at<clock_timestamp()-interval '10 minutes';
  -- Keep retrying only within the provider's idempotency retention window.
  update public.marketplace_promotion_email_jobs q set status='needs_review',finished_at=clock_timestamp(),
    last_error='Retry automatico sospeso: finestra di idempotenza scaduta.'
    where q.status='pending' and (q.attempts>=10 or q.first_attempt_at<clock_timestamp()-interval '23 hours');
  return query
    with candidates as (
      select q.compensation_event_id from public.marketplace_promotion_email_jobs q
      where q.status='pending' and q.available_at<=clock_timestamp()
      order by q.available_at,q.created_at,q.compensation_event_id
      limit greatest(1,least(coalesce(p_limit,10),50)) for update skip locked
    )
    update public.marketplace_promotion_email_jobs q set status='processing',lease_id=gen_random_uuid(),
      locked_at=clock_timestamp(),first_attempt_at=coalesce(q.first_attempt_at,clock_timestamp()),attempts=q.attempts+1
    from candidates c where q.compensation_event_id=c.compensation_event_id
    returning q.compensation_event_id,q.lease_id;
end;
$$;

create or replace function public.get_marketplace_promotion_email_context(p_event_id uuid,p_lease_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'eventId',e.id,'profileId',p.id,'email',p.email,'firstName',p.first_name,
    'leadId',s.lead_id,'purchaseId',s.purchase_id,'leadTitle',coalesce(l.title,'Immobile'),
    'amountCents',e.amount_cents,
    'alreadySent',exists(select 1 from public.email_delivery_logs d
      where d.event_type='team.marketplace_promotion_earned' and d.status='sent'
        and d.metadata->>'compensation_event_id'=e.id::text)
  )
  from public.marketplace_promotion_email_jobs q
  join public.team_compensation_events e on e.id=q.compensation_event_id
  join public.marketplace_lead_promotion_sales s on s.compensation_event_id=e.id
  join public.team_members m on m.id=e.member_id and m.profile_id=q.profile_id and m.status='active'
  join public.profiles p on p.id=q.profile_id and p.status='active'
  join public.leads l on l.id=s.lead_id
  where q.compensation_event_id=p_event_id and q.lease_id=p_lease_id and q.status='processing'
    and e.event_type='marketplace_promotion_sale' and e.status='accrued' and e.amount_cents>0
    and s.reversal_event_id is null and s.refund_handled_at is null
    and not exists(select 1 from public.refunds r where r.lead_purchase_id=s.purchase_id
      and r.status='paid' and (r.amount_cents is null or r.amount_cents>0))
$$;

create or replace function public.finish_marketplace_promotion_email(
  p_event_id uuid,p_lease_id uuid,p_status text,p_error text default null
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('sent','skipped','pending','needs_review') then raise exception 'invalid_email_job_status'; end if;
  update public.marketplace_promotion_email_jobs q set status=p_status,
    finished_at=case when p_status='pending' then null else clock_timestamp() end,
    available_at=case when p_status='pending' then clock_timestamp()+make_interval(secs=>least(3600,30*power(2,least(q.attempts,6))::integer)) else q.available_at end,
    last_error=left(p_error,1000),lease_id=null,locked_at=null
    where q.compensation_event_id=p_event_id and q.lease_id=p_lease_id and q.status='processing';
  return found;
end;
$$;
revoke all on function public.claim_marketplace_promotion_emails(integer) from public,anon,authenticated;
revoke all on function public.get_marketplace_promotion_email_context(uuid,uuid) from public,anon,authenticated;
revoke all on function public.finish_marketplace_promotion_email(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_marketplace_promotion_emails(integer) to service_role;
grant execute on function public.get_marketplace_promotion_email_context(uuid,uuid) to service_role;
grant execute on function public.finish_marketplace_promotion_email(uuid,uuid,text,text) to service_role;

-- Preserve custom content and recipient rules; append only the new optional block.
update public.settings s set value=coalesce((
  select jsonb_agg(case when item->>'id'='admin.lead_purchased'
    and coalesce(item->>'extra','') not like '%promotion_details%'
    and coalesce(item->>'extra','') not like '%promotion_member_name%'
    then jsonb_set(item,'{extra}',to_jsonb(concat_ws(E'\n',nullif(coalesce(item->>'extra',''),''),'{{promotion_details}}')))
    else item end order by ord)
  from jsonb_array_elements(s.value) with ordinality a(item,ord)
),'[]'::jsonb) where s.key='email.transactional_templates' and jsonb_typeof(s.value)='array';
commit;
