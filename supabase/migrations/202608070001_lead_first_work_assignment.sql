-- Keeps the first real operational owner of a new lead separate from its status.
-- Opening a lead never writes these fields: they are set only by an operational move.

alter table team_members
  add column if not exists badge_color text not null default '#2563EB';

alter table team_members
  drop constraint if exists team_members_badge_color_format;

alter table team_members
  add constraint team_members_badge_color_format
  check (badge_color ~ '^#[0-9A-Fa-f]{6}$');

alter table owner_requests
  add column if not exists first_worked_by_profile_id uuid
  references profiles(id) on delete set null,
  add column if not exists first_worked_at timestamptz;

create index if not exists owner_requests_first_worked_by_idx
  on owner_requests (first_worked_by_profile_id)
  where first_worked_by_profile_id is not null;

-- One atomic write prevents a second moderator from replacing the colleague who
-- first moved the lead in the review pipeline.
create or replace function move_owner_request_review_pipeline_stage(
  p_owner_request_id uuid,
  p_stage_id uuid,
  p_actor_profile_id uuid
)
returns owner_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  moved owner_requests;
begin
  update owner_requests
  set
    review_pipeline_stage_id = p_stage_id,
    first_worked_by_profile_id = coalesce(first_worked_by_profile_id, p_actor_profile_id),
    first_worked_at = coalesce(first_worked_at, now())
  where id = p_owner_request_id
    and status = 'to_verify'
  returning * into moved;

  return moved;
end;
$$;

revoke all on function move_owner_request_review_pipeline_stage(uuid, uuid, uuid) from public;
grant execute on function move_owner_request_review_pipeline_stage(uuid, uuid, uuid) to service_role;
