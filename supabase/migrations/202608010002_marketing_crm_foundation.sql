-- Private Marketing CRM foundation.
-- The application exposes this module to Super Admin only during the preview phase.

create table if not exists marketing_crm_pipelines (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  name text not null default 'La mia pipeline',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_crm_pipelines_name_length
    check (char_length(btrim(name)) between 2 and 100)
);

create unique index if not exists marketing_crm_one_default_pipeline_per_profile_idx
  on marketing_crm_pipelines (profile_id)
  where is_default;

create index if not exists marketing_crm_pipelines_profile_idx
  on marketing_crm_pipelines (profile_id, created_at);

create table if not exists marketing_crm_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references marketing_crm_pipelines(id) on delete cascade,
  name text not null,
  color text not null default '#047857',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_crm_stages_name_length
    check (char_length(btrim(name)) between 2 and 80),
  constraint marketing_crm_stages_color_format
    check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create index if not exists marketing_crm_stages_pipeline_position_idx
  on marketing_crm_stages (pipeline_id, position, created_at);

create table if not exists marketing_crm_contacts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  pipeline_id uuid not null references marketing_crm_pipelines(id) on delete cascade,
  stage_id uuid not null references marketing_crm_stages(id) on delete restrict,
  full_name text not null,
  email text,
  phone text,
  property_address text,
  notes text,
  next_follow_up_at timestamptz,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_crm_contacts_name_length
    check (char_length(btrim(full_name)) between 2 and 140),
  constraint marketing_crm_contacts_email_length
    check (email is null or char_length(email) <= 255),
  constraint marketing_crm_contacts_phone_length
    check (phone is null or char_length(phone) <= 50),
  constraint marketing_crm_contacts_address_length
    check (property_address is null or char_length(property_address) <= 300),
  constraint marketing_crm_contacts_notes_length
    check (notes is null or char_length(notes) <= 5000)
);

create index if not exists marketing_crm_contacts_profile_updated_idx
  on marketing_crm_contacts (profile_id, updated_at desc);

create index if not exists marketing_crm_contacts_stage_position_idx
  on marketing_crm_contacts (stage_id, position, created_at);

create or replace function validate_marketing_crm_contact_stage()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from marketing_crm_stages stage
    where stage.id = new.stage_id
      and stage.pipeline_id = new.pipeline_id
  ) then
    raise exception 'marketing_crm_stage_pipeline_mismatch';
  end if;

  if not exists (
    select 1
    from marketing_crm_pipelines pipeline
    where pipeline.id = new.pipeline_id
      and pipeline.profile_id = new.profile_id
  ) then
    raise exception 'marketing_crm_pipeline_profile_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists marketing_crm_pipelines_updated_at on marketing_crm_pipelines;
create trigger marketing_crm_pipelines_updated_at
before update on marketing_crm_pipelines
for each row execute function set_updated_at();

drop trigger if exists marketing_crm_stages_updated_at on marketing_crm_stages;
create trigger marketing_crm_stages_updated_at
before update on marketing_crm_stages
for each row execute function set_updated_at();

drop trigger if exists marketing_crm_contacts_updated_at on marketing_crm_contacts;
create trigger marketing_crm_contacts_updated_at
before update on marketing_crm_contacts
for each row execute function set_updated_at();

drop trigger if exists marketing_crm_contacts_validate_stage on marketing_crm_contacts;
create trigger marketing_crm_contacts_validate_stage
before insert or update of profile_id, pipeline_id, stage_id on marketing_crm_contacts
for each row execute function validate_marketing_crm_contact_stage();

alter table marketing_crm_pipelines enable row level security;
alter table marketing_crm_stages enable row level security;
alter table marketing_crm_contacts enable row level security;

drop policy if exists "marketing_crm_pipelines_owner_access" on marketing_crm_pipelines;
create policy "marketing_crm_pipelines_owner_access"
on marketing_crm_pipelines for all
to authenticated
using (profile_id = current_profile_id() or is_super_admin())
with check (profile_id = current_profile_id() or is_super_admin());

drop policy if exists "marketing_crm_stages_owner_access" on marketing_crm_stages;
create policy "marketing_crm_stages_owner_access"
on marketing_crm_stages for all
to authenticated
using (
  is_super_admin()
  or exists (
    select 1
    from marketing_crm_pipelines pipeline
    where pipeline.id = marketing_crm_stages.pipeline_id
      and pipeline.profile_id = current_profile_id()
  )
)
with check (
  is_super_admin()
  or exists (
    select 1
    from marketing_crm_pipelines pipeline
    where pipeline.id = marketing_crm_stages.pipeline_id
      and pipeline.profile_id = current_profile_id()
  )
);

drop policy if exists "marketing_crm_contacts_owner_access" on marketing_crm_contacts;
create policy "marketing_crm_contacts_owner_access"
on marketing_crm_contacts for all
to authenticated
using (profile_id = current_profile_id() or is_super_admin())
with check (profile_id = current_profile_id() or is_super_admin());
