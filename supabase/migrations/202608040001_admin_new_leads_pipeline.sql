-- Operational pipeline for owner requests that are still in the "Nuovi Lead" state.
-- This is intentionally separate from owner_requests.status: publishing, pending and
-- rejection continue to use the existing status lifecycle.

create table if not exists admin_lead_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#047857',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_lead_pipeline_stages_name_length
    check (char_length(btrim(name)) between 2 and 80),
  constraint admin_lead_pipeline_stages_color_format
    check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create index if not exists admin_lead_pipeline_stages_position_idx
  on admin_lead_pipeline_stages (position, created_at);

insert into admin_lead_pipeline_stages (name, color, position)
select seed.name, seed.color, seed.position
from (
  values
    ('Nuovi Lead', '#2563EB', 0),
    ('WhatsApp inviato', '#7C3AED', 1),
    ('Non Risponde', '#B45309', 2),
    ('Richiamare', '#C2410C', 3),
    ('Interessato', '#047857', 4),
    ('Non Interessato', '#B91C1C', 5)
) as seed(name, color, position)
where not exists (select 1 from admin_lead_pipeline_stages);

alter table owner_requests
  add column if not exists review_pipeline_stage_id uuid
  references admin_lead_pipeline_stages(id) on delete restrict;

create index if not exists owner_requests_review_pipeline_stage_idx
  on owner_requests (review_pipeline_stage_id, status, created_at desc);

update owner_requests
set review_pipeline_stage_id = (
  select id
  from admin_lead_pipeline_stages
  order by position asc, created_at asc
  limit 1
)
where status = 'to_verify'
  and review_pipeline_stage_id is null;

create or replace function assign_owner_request_review_pipeline_stage()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- New owner requests and requests restored to "Nuovi Lead" start in the first column.
  if new.status = 'to_verify'
    and (tg_op = 'INSERT' or old.status is distinct from new.status)
  then
    select id
    into new.review_pipeline_stage_id
    from admin_lead_pipeline_stages
    order by position asc, created_at asc
    limit 1;
  end if;

  return new;
end;
$$;

drop trigger if exists owner_requests_assign_review_pipeline_stage on owner_requests;
create trigger owner_requests_assign_review_pipeline_stage
before insert or update of status on owner_requests
for each row execute function assign_owner_request_review_pipeline_stage();

drop trigger if exists admin_lead_pipeline_stages_updated_at on admin_lead_pipeline_stages;
create trigger admin_lead_pipeline_stages_updated_at
before update on admin_lead_pipeline_stages
for each row execute function set_updated_at();

alter table admin_lead_pipeline_stages enable row level security;
