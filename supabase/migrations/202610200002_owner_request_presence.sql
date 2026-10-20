-- Temporary open-card sessions, independent of activity, assignment and compensation.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists public.owner_request_presence (
  session_id uuid primary key,
  owner_request_id uuid not null references public.owner_requests(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  closed_at timestamptz
);
create index if not exists owner_request_presence_request_idx
  on public.owner_request_presence(owner_request_id, expires_at) where closed_at is null;
create index if not exists owner_request_presence_expiry_idx on public.owner_request_presence(expires_at);
alter table public.owner_request_presence enable row level security;
revoke all on public.owner_request_presence from public, anon, authenticated;
grant select, insert, update, delete on public.owner_request_presence to service_role;

create or replace function public.update_owner_request_presence(
  p_owner_request_id uuid, p_actor_profile_id uuid, p_session_id uuid, p_action text
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_now timestamptz := clock_timestamp(); v_status text; v_people jsonb;
begin
  if not public.can_take_owner_request(p_actor_profile_id) then
    raise exception 'Operatore non autorizzato' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('heartbeat','release') or p_session_id is null then
    raise exception 'Presenza non valida' using errcode = '22023';
  end if;
  delete from public.owner_request_presence where expires_at <= v_now;
  select status into v_status from public.owner_requests where id = p_owner_request_id;
  if not found then return jsonb_build_object('status','inactive','serverNow',v_now,'participants','[]'::jsonb); end if;

  if p_action = 'release' then
    -- A tombstone prevents a delayed heartbeat from resurrecting a closed modal.
    insert into public.owner_request_presence(session_id,owner_request_id,profile_id,expires_at,closed_at)
    values(p_session_id,p_owner_request_id,p_actor_profile_id,v_now + interval '1 day',v_now)
    on conflict(session_id) do update set closed_at = v_now, expires_at = v_now + interval '1 day'
      where owner_request_presence.profile_id = p_actor_profile_id
        and owner_request_presence.owner_request_id = p_owner_request_id;
    return jsonb_build_object('status','closed','serverNow',v_now,'participants','[]'::jsonb);
  end if;
  if v_status <> 'to_verify' then
    return jsonb_build_object('status','inactive','serverNow',v_now,'participants','[]'::jsonb);
  end if;
  insert into public.owner_request_presence(session_id,owner_request_id,profile_id,expires_at)
  values(p_session_id,p_owner_request_id,p_actor_profile_id,v_now + interval '3 minutes')
  on conflict(session_id) do update set expires_at = excluded.expires_at
    where owner_request_presence.profile_id = p_actor_profile_id
      and owner_request_presence.owner_request_id = p_owner_request_id
      and owner_request_presence.closed_at is null;
  if not found then return jsonb_build_object('status','conflict','serverNow',v_now,'participants','[]'::jsonb); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'profileId',p.id,'name',coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Membro del team'),
    'badgeColor',tm.badge_color,'expiresAt',s.expires_at
  ) order by p.first_name,p.last_name,p.id),'[]'::jsonb) into v_people
  from (
    select profile_id,max(expires_at) as expires_at from public.owner_request_presence
    where owner_request_id = p_owner_request_id and profile_id <> p_actor_profile_id
      and closed_at is null and expires_at > v_now
    group by profile_id
  ) s join public.profiles p on p.id = s.profile_id
  left join public.team_members tm on tm.profile_id = p.id
  where public.can_take_owner_request(p.id);
  return jsonb_build_object('status','active','serverNow',v_now,'participants',v_people);
end;
$$;
revoke all on function public.update_owner_request_presence(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.update_owner_request_presence(uuid,uuid,uuid,text) to service_role;
commit;
