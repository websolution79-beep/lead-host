-- Additive metadata. No lead statuses, assignments, prices or compensation changes.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table if not exists public.owner_request_operational_activity (
  owner_request_id uuid primary key references public.owner_requests(id) on delete cascade,
  last_activity_at timestamptz not null,
  kind text not null check (kind in ('pipeline_move', 'note_updated', 'information_updated')),
  source text not null check (source in ('tracked', 'audit')),
  actor_profile_id uuid references public.profiles(id) on delete set null
);
create index if not exists owner_request_operational_activity_date_idx
  on public.owner_request_operational_activity(last_activity_at);
alter table public.owner_request_operational_activity enable row level security;
revoke all on public.owner_request_operational_activity from public, anon, authenticated;
grant select, insert, update, delete on public.owner_request_operational_activity to service_role;

-- Historical operations are explicitly labelled: old audit records can include no-op saves.
insert into public.owner_request_operational_activity(owner_request_id, last_activity_at, kind, source, actor_profile_id)
select distinct on (a.entity_id) a.entity_id, a.created_at,
  case when a.action = 'lead.pipeline.move_request' then 'pipeline_move'
    when a."before" ? 'qualification_notes' and a."after" ? 'qualification_notes'
      and a."before"->'qualification_notes' is distinct from a."after"->'qualification_notes' then 'note_updated'
    else 'information_updated' end,
  'audit', a.actor_profile_id
from public.audit_logs a join public.owner_requests r on r.id = a.entity_id
where a.entity_type = 'owner_request'
  and a.action in ('lead.pipeline.move_request', 'lead.information_updated')
  and a.created_at >= r.created_at
order by a.entity_id, a.created_at desc, a.id desc
on conflict (owner_request_id) do update set
  last_activity_at = excluded.last_activity_at, kind = excluded.kind,
  source = excluded.source, actor_profile_id = excluded.actor_profile_id
where public.owner_request_operational_activity.source = 'audit'
  and public.owner_request_operational_activity.last_activity_at < excluded.last_activity_at;

create or replace function public.record_owner_request_operational_activity(
  p_owner_request_id uuid, p_actor_profile_id uuid, p_kind text
) returns timestamptz language plpgsql security definer set search_path = public
as $$
declare v_at timestamptz;
begin
  if not public.can_take_owner_request(p_actor_profile_id) then
    raise exception 'Operatore non autorizzato' using errcode = '42501';
  end if;
  if p_kind not in ('pipeline_move', 'note_updated', 'information_updated') or p_kind is null then
    raise exception 'Attivita non valida' using errcode = '22023';
  end if;
  perform 1 from public.owner_requests where id = p_owner_request_id for update;
  if not found then raise exception 'Lead non trovato' using errcode = 'P0002'; end if;
  v_at := clock_timestamp();
  insert into public.owner_request_operational_activity(owner_request_id,last_activity_at,kind,source,actor_profile_id)
  values (p_owner_request_id,v_at,p_kind,'tracked',p_actor_profile_id)
  on conflict (owner_request_id) do update set
    last_activity_at = excluded.last_activity_at, kind = excluded.kind,
    source = excluded.source, actor_profile_id = excluded.actor_profile_id
  where public.owner_request_operational_activity.last_activity_at <= excluded.last_activity_at;
  return v_at;
end;
$$;
revoke all on function public.record_owner_request_operational_activity(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.record_owner_request_operational_activity(uuid,uuid,text) to service_role;

-- Preserve existing first-work attribution; only a real phase change updates last activity.
create or replace function public.move_owner_request_review_pipeline_stage(
  p_owner_request_id uuid, p_stage_id uuid, p_actor_profile_id uuid
) returns public.owner_requests language plpgsql security definer set search_path = public
as $$
declare previous_stage uuid; moved public.owner_requests;
begin
  select review_pipeline_stage_id into previous_stage from public.owner_requests
    where id = p_owner_request_id and status = 'to_verify' for update;
  if not found then return null; end if;
  update public.owner_requests set
    review_pipeline_stage_id = p_stage_id,
    first_worked_by_profile_id = coalesce(first_worked_by_profile_id,p_actor_profile_id),
    first_worked_at = coalesce(first_worked_at,now())
  where id = p_owner_request_id and status = 'to_verify' returning * into moved;
  if previous_stage is distinct from p_stage_id then
    perform public.record_owner_request_operational_activity(p_owner_request_id,p_actor_profile_id,'pipeline_move');
  end if;
  return moved;
end;
$$;
revoke all on function public.move_owner_request_review_pipeline_stage(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.move_owner_request_review_pipeline_stage(uuid,uuid,uuid) to service_role;
commit;
