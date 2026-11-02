-- Completes the opt-in workflow. Does not enable the service or change its price.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create or replace function public.booking_call_context_internal(p_booking_call_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $function$
  select jsonb_build_object(
    'id',b.id,'leadId',b.lead_id,'ownerRequestId',b.owner_request_id,'purchaseId',b.lead_purchase_id,'propertyManagerId',b.property_manager_id,
    'qualifyingMemberId',b.qualifying_member_id,'assignedMemberId',b.assigned_member_id,
    'status',b.status,'scheduledAt',b.scheduled_at,'createdAt',b.created_at,
    'leadAmountCents',b.lead_amount_cents,'bookingFeeCents',b.booking_fee_cents,'totalAmountCents',b.total_amount_cents,
    'compensationCents',b.compensation_cents,'needsAttribution',b.qualifying_member_id is null,
    'leadTitle',l.title,'city',prop.city,
    'owner',jsonb_build_object('firstName',c.first_name,'lastName',c.last_name,'email',c.email,'phone',c.phone,'address',c.precise_address),
    'buyer',jsonb_build_object('profileId',p.id,'firstName',p.first_name,'lastName',p.last_name,'email',lower(p.email),'phone',p.phone,'companyName',pm.company_name),
    'coordinatorName',nullif(trim(concat_ws(' ',coordinator.first_name,coordinator.last_name)),''),
    'emailStatus',queue.status,'emailLastError',queue.last_error
  ) from public.marketplace_booking_calls b
  join public.leads l on l.id = b.lead_id
  join public.property_manager_profiles pm on pm.id = b.property_manager_id
  join public.profiles p on p.id = pm.profile_id
  left join public.owner_contacts c on c.owner_request_id = b.owner_request_id
  left join public.properties prop on prop.id = l.property_id
  left join public.team_members member on member.id = b.assigned_member_id
  left join public.profiles coordinator on coordinator.id = member.profile_id
  left join public.marketplace_booking_call_email_outbox queue on queue.booking_call_id = b.id
  where b.id = p_booking_call_id;
$function$;

create or replace function public.get_booking_call_task(p_actor_profile_id uuid,p_booking_call_id uuid default null,p_lead_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
declare v_booking public.marketplace_booking_calls; v_admin boolean;
begin
  if (p_booking_call_id is null) = (p_lead_id is null) then raise exception 'booking_task_identifier_invalid'; end if;
  if not exists(select 1 from public.profiles where id = p_actor_profile_id and status = 'active') then return null; end if;
  select exists(select 1 from public.user_roles where profile_id = p_actor_profile_id and role::text = 'super_admin') into v_admin;
  select * into v_booking from public.marketplace_booking_calls
    where (p_booking_call_id is not null and id = p_booking_call_id)
      or (p_booking_call_id is null and lead_id = p_lead_id)
    order by created_at desc,id desc limit 1;
  if not found then return null; end if;
  if not v_admin and not exists(select 1 from public.team_members m join public.user_roles r on r.profile_id = m.profile_id
    where m.id = v_booking.assigned_member_id and m.profile_id = p_actor_profile_id
      and m.status = 'active' and r.role::text = 'team_member') then return null; end if;
  return public.booking_call_context_internal(v_booking.id);
end;
$function$;

create or replace function public.update_booking_call_task(
  p_actor_profile_id uuid,p_booking_call_id uuid,p_status text,p_scheduled_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_before public.marketplace_booking_calls; v_task jsonb; v_admin boolean;
begin
  if p_status is null or p_status not in ('to_schedule','in_progress','scheduled') then raise exception 'booking_task_status_invalid'; end if;
  if p_status = 'scheduled' and p_scheduled_at is null then raise exception 'booking_task_date_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('booking_call:' || p_booking_call_id::text,0));
  select * into v_before from public.marketplace_booking_calls where id = p_booking_call_id for update;
  v_task := public.get_booking_call_task(p_actor_profile_id,p_booking_call_id,null);
  if v_task is null then raise exception 'booking_task_not_authorized' using errcode = '42501'; end if;
  if v_before.status = 'refunded' then raise exception 'booking_purchase_refunded'; end if;
  if p_status <> 'scheduled' then p_scheduled_at := null; end if;
  if v_before.status = p_status and v_before.scheduled_at is not distinct from p_scheduled_at then return v_task; end if;
  update public.marketplace_booking_calls set status = p_status,scheduled_at = p_scheduled_at,
    updated_at = now(),updated_by = p_actor_profile_id where id = p_booking_call_id;
  select exists(select 1 from public.user_roles where profile_id = p_actor_profile_id and role::text = 'super_admin') into v_admin;
  insert into public.audit_logs(actor_profile_id,actor_role,entity_type,entity_id,action,before,after)
    values(p_actor_profile_id,case when v_admin then 'super_admin' else 'team_member' end,
      'booking_call',p_booking_call_id,'booking_call.status_updated',
      jsonb_build_object('status',v_before.status,'scheduled_at',v_before.scheduled_at),
      jsonb_build_object('status',p_status,'scheduled_at',p_scheduled_at));
  return public.booking_call_context_internal(p_booking_call_id);
end;
$function$;

create or replace function public.claim_booking_call_emails(p_limit integer default 1,p_booking_call_id uuid default null)
returns table(booking_call_id uuid,lease_id uuid) language plpgsql security definer set search_path = ''
as $function$
begin
  return query with candidates as (
    select q.booking_call_id from public.marketplace_booking_call_email_outbox q
    join public.marketplace_booking_calls b on b.id = q.booking_call_id
    where b.status <> 'refunded' and (p_booking_call_id is null or q.booking_call_id = p_booking_call_id)
      and ((q.status = 'pending' and q.available_at <= clock_timestamp())
        or (q.status = 'processing' and q.locked_at < clock_timestamp()-interval '3 minutes'))
    order by q.available_at,q.created_at,q.booking_call_id
    limit greatest(1,least(coalesce(p_limit,1),3)) for update of q skip locked
  ) update public.marketplace_booking_call_email_outbox q set status = 'processing',lease_id = gen_random_uuid(),
    locked_at = clock_timestamp(),completed_at = null,attempts = q.attempts+1
    from candidates c where q.booking_call_id = c.booking_call_id returning q.booking_call_id,q.lease_id;
end;
$function$;

create or replace function public.get_booking_call_email_context(p_booking_call_id uuid,p_lease_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
declare v_booking public.marketplace_booking_calls; v_context jsonb; v_recipients jsonb; v_balance integer;
begin
  if not exists(select 1 from public.marketplace_booking_call_email_outbox q
    where q.booking_call_id = p_booking_call_id and q.status = 'processing' and q.lease_id = p_lease_id
      and q.locked_at > now()-interval '3 minutes') then return null; end if;
  select * into v_booking from public.marketplace_booking_calls where id = p_booking_call_id;
  if not found or v_booking.status = 'refunded' then return null; end if;
  if not exists(select 1 from public.lead_purchases p where p.id = v_booking.lead_purchase_id
    and p.property_manager_id = v_booking.property_manager_id and p.lead_id = v_booking.lead_id
    and p.mode = 'exclusive' and p.status in ('paid','contact_unlocked') and p.amount_cents = v_booking.total_amount_cents) then
    raise exception 'booking_email_purchase_invalid';
  end if;
  select w.balance_after_cents into v_balance from public.wallet_transactions w
    where w.lead_purchase_id = v_booking.lead_purchase_id and w.type = 'lead_purchase' and w.status = 'completed'
      and w.amount_cents = -v_booking.total_amount_cents and w.metadata ->> 'booking_call_id' = v_booking.id::text;
  if not found then raise exception 'booking_email_wallet_invalid'; end if;
  with assigned as (
    select p.id,lower(p.email) as email,p.first_name,p.last_name from public.team_members m join public.profiles p on p.id = m.profile_id
      where m.id = v_booking.assigned_member_id and m.status = 'active' and p.status = 'active'
        and exists(select 1 from public.user_roles r where r.profile_id = p.id and r.role::text in ('team_member','super_admin'))
  ), recipients as (
    select * from assigned
    union all
    select p.id,lower(p.email),p.first_name,p.last_name from public.profiles p join public.user_roles r on r.profile_id = p.id
      where r.role::text = 'super_admin' and p.status = 'active' and not exists(select 1 from assigned)
  ) select coalesce(jsonb_agg(jsonb_build_object('profileId',id,'email',email,'firstName',first_name,'lastName',last_name)),'[]'::jsonb)
    into v_recipients from recipients;
  v_context := public.booking_call_context_internal(p_booking_call_id);
  return v_context || jsonb_build_object('recipients',v_recipients,'balanceCents',v_balance);
end;
$function$;

create or replace function public.finish_booking_call_email(p_booking_call_id uuid,p_lease_id uuid,p_status text,p_error text default null)
returns boolean language plpgsql security definer set search_path = ''
as $function$
begin
  if p_status is null or p_status not in ('pending','sent','skipped') then raise exception 'booking_email_finish_invalid'; end if;
  update public.marketplace_booking_call_email_outbox q set status = p_status,
    lease_id = null,locked_at = null,last_error = left(p_error,1000),
    completed_at = case when p_status in ('sent','skipped') then clock_timestamp() else null end,
    available_at = case when p_status = 'pending' then clock_timestamp()+interval '1 minute' * least(360,power(2,least(q.attempts,8))::integer) else q.available_at end
    where q.booking_call_id = p_booking_call_id and q.status = 'processing' and q.lease_id = p_lease_id;
  return found;
end;
$function$;

create or replace function public.requeue_booking_call_assignment_email()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if new.assigned_member_id is distinct from old.assigned_member_id and new.assigned_member_id is not null
    and new.status <> 'refunded' then
    update public.marketplace_booking_call_email_outbox set status = 'pending',available_at = clock_timestamp(),
      completed_at = null,lease_id = null,locked_at = null,last_error = null where booking_call_id = new.id;
  end if;
  return new;
end;
$function$;

create or replace function public.retry_booking_call_email(p_actor_profile_id uuid,p_booking_call_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $function$
declare v_task jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('booking_call:' || p_booking_call_id::text,0));
  v_task := public.get_booking_call_task(p_actor_profile_id,p_booking_call_id,null);
  if v_task is null then raise exception 'booking_task_not_authorized' using errcode = '42501'; end if;
  if v_task ->> 'status' = 'refunded' then raise exception 'booking_purchase_refunded'; end if;
  update public.marketplace_booking_call_email_outbox q set status = 'pending',available_at = clock_timestamp(),
    completed_at = null,lease_id = null,locked_at = null,last_error = null
    where q.booking_call_id = p_booking_call_id and not (q.status = 'processing' and q.locked_at > clock_timestamp()-interval '3 minutes');
  return found;
end;
$function$;
drop trigger if exists booking_call_assignment_email on public.marketplace_booking_calls;
create trigger booking_call_assignment_email after update of assigned_member_id on public.marketplace_booking_calls
  for each row execute function public.requeue_booking_call_assignment_email();

create or replace function public.get_marketplace_booking_call_readiness_v3()
returns jsonb language sql stable security definer set search_path = ''
as $function$
  select public.get_marketplace_booking_call_readiness_v2()
    || jsonb_build_object('schemaVersion',3,'workflowReady',true);
$function$;

revoke all on function public.booking_call_context_internal(uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_booking_call_task(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.update_booking_call_task(uuid,uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.claim_booking_call_emails(integer,uuid) from public,anon,authenticated;
revoke all on function public.get_booking_call_email_context(uuid,uuid) from public,anon,authenticated;
revoke all on function public.finish_booking_call_email(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.requeue_booking_call_assignment_email() from public,anon,authenticated;
revoke all on function public.get_marketplace_booking_call_readiness_v3() from public,anon,authenticated;
revoke all on function public.retry_booking_call_email(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_booking_call_task(uuid,uuid,uuid) to service_role;
grant execute on function public.update_booking_call_task(uuid,uuid,text,timestamptz) to service_role;
grant execute on function public.claim_booking_call_emails(integer,uuid) to service_role;
grant execute on function public.get_booking_call_email_context(uuid,uuid) to service_role;
grant execute on function public.finish_booking_call_email(uuid,uuid,text,text) to service_role;
grant execute on function public.get_marketplace_booking_call_readiness_v3() to service_role;
grant execute on function public.retry_booking_call_email(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
