-- Additive operational assignment, independent of first work and compensation.
create table if not exists public.owner_request_assignments (
  owner_request_id uuid primary key references public.owner_requests(id) on delete cascade,
  assignee_profile_id uuid references public.profiles(id) on delete restrict,
  revision bigint not null default 0 check (revision >= 0),
  assigned_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  constraint owner_request_assignments_dates check (
    (assignee_profile_id is null and assigned_at is null) or
    (assignee_profile_id is not null and assigned_at is not null)
  )
);

create index if not exists owner_request_assignments_assignee_idx
  on public.owner_request_assignments(assignee_profile_id)
  where assignee_profile_id is not null;

alter table public.owner_request_assignments enable row level security;
revoke all on public.owner_request_assignments from public, anon, authenticated;
grant select, insert, update, delete on public.owner_request_assignments to service_role;

create or replace function public.can_take_owner_request(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p where p.id = p_profile_id and p.status = 'active'
    and (
      exists (select 1 from public.user_roles ur where ur.profile_id = p.id and ur.role = 'super_admin')
      or (
        exists (select 1 from public.user_roles ur where ur.profile_id = p.id and ur.role = 'team_member')
        and exists (
          select 1 from public.team_members tm
          join public.team_roles tr on tr.id = tm.role_id and tr.is_active
          join public.team_role_permissions rp on rp.role_id = tr.id
            and rp.permission_key = 'leads' and rp.access_level = 'write'
          where tm.profile_id = p.id and tm.status = 'active' and not tm.must_change_password
        )
      )
    )
  );
$$;

create or replace function public.owner_request_assignment_candidates(p_actor_profile_id uuid)
returns table(profile_id uuid, first_name text, last_name text, badge_color text)
language sql stable security definer set search_path = public
as $$
  with actor as materialized (
    select public.can_take_owner_request(p_actor_profile_id) as allowed,
      exists (select 1 from public.user_roles ur
        where ur.profile_id = p_actor_profile_id and ur.role = 'super_admin') as super_admin
  ), eligible as materialized (
    select distinct ur.profile_id from public.user_roles ur cross join actor
    where actor.allowed and ur.role in ('super_admin', 'team_member')
      and (actor.super_admin or ur.profile_id = p_actor_profile_id)
  )
  select p.id, p.first_name, p.last_name, tm.badge_color
  from eligible join public.profiles p on p.id = eligible.profile_id
  left join public.team_members tm on tm.profile_id = p.id
  where public.can_take_owner_request(p.id)
  order by p.first_name nulls last, p.last_name nulls last, p.id;
$$;

create or replace function public.set_owner_request_assignment(
  p_owner_request_id uuid,
  p_actor_profile_id uuid,
  p_assignee_profile_id uuid,
  p_expected_revision bigint
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_super_admin boolean;
  v_status text;
  v_before public.owner_request_assignments%rowtype;
  v_after public.owner_request_assignments%rowtype;
begin
  if not public.can_take_owner_request(p_actor_profile_id) then
    return jsonb_build_object('status', 'forbidden');
  end if;
  select exists (select 1 from public.user_roles
    where profile_id = p_actor_profile_id and role = 'super_admin') into v_super_admin;
  if not v_super_admin and p_assignee_profile_id is not null
    and p_assignee_profile_id <> p_actor_profile_id then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if p_assignee_profile_id is not null and not public.can_take_owner_request(p_assignee_profile_id) then
    return jsonb_build_object('status', 'invalid_assignee');
  end if;

  -- Serialize with publication/status changes and all claims for this lead.
  select status::text into v_status from public.owner_requests
    where id = p_owner_request_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v_status <> 'to_verify' then return jsonb_build_object('status', 'unavailable'); end if;

  select * into v_before from public.owner_request_assignments
    where owner_request_id = p_owner_request_id for update;
  if p_expected_revision is null or p_expected_revision < 0
    or coalesce(v_before.revision, 0) <> p_expected_revision then
    return jsonb_build_object('status', 'conflict');
  end if;
  if not v_super_admin and v_before.assignee_profile_id is not null
    and v_before.assignee_profile_id <> p_actor_profile_id then
    return jsonb_build_object('status', 'occupied');
  end if;
  if v_before.assignee_profile_id is not distinct from p_assignee_profile_id then
    return jsonb_build_object('status', 'unchanged');
  end if;

  insert into public.owner_request_assignments (
    owner_request_id, assignee_profile_id, revision, assigned_at, updated_at, updated_by_profile_id
  ) values (
    p_owner_request_id, p_assignee_profile_id, coalesce(v_before.revision, 0) + 1,
    case when p_assignee_profile_id is not null then now() end, now(), p_actor_profile_id
  ) on conflict(owner_request_id) do update set
    assignee_profile_id = excluded.assignee_profile_id,
    revision = excluded.revision, assigned_at = excluded.assigned_at,
    updated_at = excluded.updated_at, updated_by_profile_id = excluded.updated_by_profile_id
  returning * into v_after;

  -- Assignment and its audit commit or roll back together.
  insert into public.audit_logs(actor_profile_id, actor_role, entity_type, entity_id, action, "before", "after")
  values (
    p_actor_profile_id, case when v_super_admin then 'super_admin' else 'team_member' end,
    'owner_request', p_owner_request_id,
    case when p_assignee_profile_id is null then 'lead.assignment.released'
      when v_before.assignee_profile_id is null then 'lead.assignment.claimed'
      else 'lead.assignment.reassigned' end,
    jsonb_build_object('assignee_profile_id', v_before.assignee_profile_id, 'revision', coalesce(v_before.revision, 0)::text),
    jsonb_build_object('assignee_profile_id', v_after.assignee_profile_id, 'revision', v_after.revision::text)
  );
  return jsonb_build_object('status', 'saved');
end;
$$;

revoke all on function public.can_take_owner_request(uuid) from public, anon, authenticated;
revoke all on function public.owner_request_assignment_candidates(uuid) from public, anon, authenticated;
revoke all on function public.set_owner_request_assignment(uuid, uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function public.can_take_owner_request(uuid) to service_role;
grant execute on function public.owner_request_assignment_candidates(uuid) to service_role;
grant execute on function public.set_owner_request_assignment(uuid, uuid, uuid, bigint) to service_role;
