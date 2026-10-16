-- Additive configuration only: the legacy importer and CRM tables are unchanged.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.marketing_systeme_integrations
  add column if not exists routing_mode text not null default 'legacy'
    constraint marketing_systeme_integrations_routing_mode check (routing_mode in ('legacy', 'flows')),
  add column if not exists discovery_expires_at timestamptz;

create table if not exists public.marketing_systeme_flows (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null,
  profile_id uuid not null,
  name text not null,
  enabled boolean not null default false,
  import_mode text not null default 'selected_pages',
  allowed_page_urls text[] not null default '{}'::text[],
  destination_stage_id uuid references public.marketing_crm_stages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_systeme_flows_identity unique (id, integration_id, profile_id),
  constraint marketing_systeme_flows_owner foreign key (integration_id, profile_id)
    references public.marketing_systeme_integrations(id, profile_id) on delete cascade,
  constraint marketing_systeme_flows_name check (char_length(btrim(name)) between 1 and 100),
  constraint marketing_systeme_flows_mode check (import_mode in ('all', 'selected_pages')),
  constraint marketing_systeme_flows_pages check (
    cardinality(allowed_page_urls) <= 50
    and array_position(allowed_page_urls, null) is null
    and coalesce(array_ndims(allowed_page_urls), 1) = 1
    and ((import_mode = 'all' and cardinality(allowed_page_urls) = 0)
      or (import_mode = 'selected_pages' and cardinality(allowed_page_urls) > 0))
  )
);

create unique index if not exists marketing_systeme_flows_name_unique
  on public.marketing_systeme_flows (integration_id, lower(btrim(name)));
-- A paused specific flow still reserves its pages; it must not fall through to all-pages import.
create unique index if not exists marketing_systeme_flows_fallback_unique
  on public.marketing_systeme_flows (integration_id) where import_mode = 'all';

create table if not exists public.marketing_systeme_field_bindings (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null,
  integration_id uuid not null,
  profile_id uuid not null,
  source_slug text not null,
  target_field text not null,
  additional_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_systeme_field_bindings_owner foreign key (flow_id, integration_id, profile_id)
    references public.marketing_systeme_flows(id, integration_id, profile_id) on delete cascade,
  constraint marketing_systeme_field_bindings_source_unique unique (flow_id, source_slug),
  constraint marketing_systeme_field_bindings_slug check (
    char_length(source_slug) between 1 and 160 and source_slug = lower(btrim(source_slug))
  ),
  constraint marketing_systeme_field_bindings_target check (target_field in (
    'full_name', 'first_name', 'last_name', 'email', 'phone', 'property_address',
    'city', 'province', 'region', 'property_type', 'bedrooms', 'bathrooms', 'area_sqm',
    'current_status', 'requested_services', 'timing', 'property_description', 'additional', 'ignore'
  )),
  constraint marketing_systeme_field_bindings_label check (
    (target_field = 'additional' and additional_label is not null
      and char_length(btrim(additional_label)) between 1 and 120)
    or (target_field <> 'additional' and additional_label is null)
  )
);

create unique index if not exists marketing_systeme_field_bindings_target_unique
  on public.marketing_systeme_field_bindings (flow_id, target_field)
  where target_field not in ('additional', 'ignore');
create unique index if not exists marketing_systeme_field_bindings_label_unique
  on public.marketing_systeme_field_bindings (flow_id, lower(btrim(additional_label)))
  where target_field = 'additional';

-- Discovery stores field names only, never payloads, contact values or signing secrets.
create table if not exists public.marketing_systeme_discovered_fields (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null,
  profile_id uuid not null,
  source_page_url text not null default '',
  source_slug text not null,
  field_label text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint marketing_systeme_discovered_fields_owner foreign key (integration_id, profile_id)
    references public.marketing_systeme_integrations(id, profile_id) on delete cascade,
  constraint marketing_systeme_discovered_fields_unique unique (integration_id, source_page_url, source_slug),
  constraint marketing_systeme_discovered_fields_slug check (
    char_length(source_slug) between 1 and 160 and source_slug = lower(btrim(source_slug))
  ),
  constraint marketing_systeme_discovered_fields_label check (
    field_label is null or char_length(btrim(field_label)) between 1 and 160
  ),
  constraint marketing_systeme_discovered_fields_page_length check (char_length(source_page_url) <= 2048)
);

-- Explicitly mapped extra answers remain separate from manually written CRM notes.
create table if not exists public.marketing_systeme_contact_fields (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null,
  profile_id uuid not null,
  crm_contact_id uuid not null references public.marketing_crm_contacts(id) on delete cascade,
  flow_id uuid references public.marketing_systeme_flows(id) on delete set null,
  flow_name text,
  field_key text not null,
  label text not null,
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_systeme_contact_fields_owner foreign key (integration_id, profile_id)
    references public.marketing_systeme_integrations(id, profile_id) on delete cascade,
  constraint marketing_systeme_contact_fields_unique unique (integration_id, crm_contact_id, field_key),
  constraint marketing_systeme_contact_fields_key check (char_length(btrim(field_key)) between 1 and 200),
  constraint marketing_systeme_contact_fields_label check (char_length(btrim(label)) between 1 and 120),
  constraint marketing_systeme_contact_fields_value check (char_length(value) <= 5000),
  constraint marketing_systeme_contact_fields_flow_name check (
    flow_name is null or char_length(btrim(flow_name)) between 1 and 100
  )
);
create index if not exists marketing_systeme_contact_fields_contact_idx
  on public.marketing_systeme_contact_fields (crm_contact_id);
create index if not exists marketing_systeme_contact_fields_flow_idx
  on public.marketing_systeme_contact_fields (flow_id) where flow_id is not null;

create or replace function public.marketing_systeme_warnings_valid(p_warnings jsonb)
returns boolean language plpgsql immutable set search_path = public as $$
declare v_item jsonb;
begin
  if p_warnings is null or jsonb_typeof(p_warnings) <> 'array' then return false; end if;
  if jsonb_array_length(p_warnings) > 50 then return false; end if;
  for v_item in select value from jsonb_array_elements(p_warnings) loop
    if jsonb_typeof(v_item) <> 'object' then return false; end if;
    if jsonb_typeof(v_item->'field') is distinct from 'string'
      or jsonb_typeof(v_item->'code') is distinct from 'string'
      or char_length(v_item->>'field') not between 1 and 160
      or v_item->>'code' not in ('invalid_number', 'invalid_email', 'invalid_value',
        'value_truncated', 'unmapped_field', 'missing_required_field')
      or v_item - 'field' - 'code' <> '{}'::jsonb
    then return false; end if;
  end loop;
  return true;
end;
$$;

create table if not exists public.marketing_systeme_event_context (
  event_id uuid primary key references public.marketing_systeme_webhook_events(id) on delete cascade,
  integration_id uuid not null,
  profile_id uuid not null,
  flow_id uuid references public.marketing_systeme_flows(id) on delete set null,
  flow_name text,
  routing_mode text not null default 'flows',
  warnings jsonb not null default '[]'::jsonb,
  constraint marketing_systeme_event_context_owner foreign key (integration_id, profile_id)
    references public.marketing_systeme_integrations(id, profile_id) on delete cascade,
  constraint marketing_systeme_event_context_mode check (routing_mode in ('legacy', 'flows')),
  constraint marketing_systeme_event_context_warnings check (public.marketing_systeme_warnings_valid(warnings)),
  constraint marketing_systeme_event_context_flow_name check (
    flow_name is null or char_length(btrim(flow_name)) between 1 and 100
  )
);
create index if not exists marketing_systeme_event_context_flow_idx
  on public.marketing_systeme_event_context (flow_id) where flow_id is not null;
create index if not exists marketing_systeme_event_context_owner_idx
  on public.marketing_systeme_event_context (integration_id);

create or replace function public.validate_marketing_systeme_flow()
returns trigger language plpgsql set search_path = public as $$
declare v_url text; v_authority text;
begin
  if tg_op = 'UPDATE' then
    if (new.integration_id, new.profile_id) is distinct from (old.integration_id, old.profile_id) then
      raise exception 'marketing_systeme_owner_immutable' using errcode = '23514';
    end if;
  end if;
  -- Serialize configuration writes with the legacy importer on the existing PM connection.
  perform 1 from public.marketing_systeme_integrations
    where id = new.integration_id and profile_id = new.profile_id for update;
  if not found then raise exception 'marketing_systeme_flow_owner_mismatch' using errcode = '23514'; end if;
  if new.destination_stage_id is not null and not exists (
    select 1 from public.marketing_crm_stages stage
    join public.marketing_crm_pipelines pipeline on pipeline.id = stage.pipeline_id
    where stage.id = new.destination_stage_id and pipeline.profile_id = new.profile_id
  ) then raise exception 'marketing_systeme_destination_profile_mismatch' using errcode = '23514'; end if;
  if (select count(*) from unnest(new.allowed_page_urls) value) <>
    (select count(distinct value) from unnest(new.allowed_page_urls) value)
  then raise exception 'marketing_systeme_duplicate_page' using errcode = '23514'; end if;
  foreach v_url in array new.allowed_page_urls loop
    v_authority := substring(v_url from '^https?://([^/]+)');
    if char_length(v_url) > 2048
      or v_url !~ '^https?://[^/?#[:space:]@]+(/[^?#[:space:]]*)?$'
      or right(v_url, 1) = '/' or v_authority <> lower(v_authority)
    then raise exception 'marketing_systeme_invalid_page_url' using errcode = '23514'; end if;
  end loop;
  if exists (
    select 1 from public.marketing_systeme_flows other
    where other.integration_id = new.integration_id and other.id <> new.id
      and other.allowed_page_urls && new.allowed_page_urls
  ) then raise exception 'marketing_systeme_page_already_assigned' using errcode = '23514'; end if;
  return new;
end;
$$;

create or replace function public.validate_marketing_systeme_extension_owner()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if (new.integration_id, new.profile_id) is distinct from (old.integration_id, old.profile_id) then
      raise exception 'marketing_systeme_owner_immutable' using errcode = '23514';
    end if;
  end if;
  if tg_table_name in ('marketing_systeme_field_bindings', 'marketing_systeme_contact_fields', 'marketing_systeme_event_context') then
    if new.flow_id is not null and not exists (
      select 1 from public.marketing_systeme_flows flow where flow.id = new.flow_id
        and flow.integration_id = new.integration_id and flow.profile_id = new.profile_id
    ) then raise exception 'marketing_systeme_flow_owner_mismatch' using errcode = '23514'; end if;
  end if;
  if tg_table_name = 'marketing_systeme_contact_fields' then
    if not exists (select 1 from public.marketing_crm_contacts contact
      where contact.id = new.crm_contact_id and contact.profile_id = new.profile_id)
    then raise exception 'marketing_systeme_contact_profile_mismatch' using errcode = '23514'; end if;
  elsif tg_table_name = 'marketing_systeme_event_context' then
    if not exists (select 1 from public.marketing_systeme_webhook_events event
      where event.id = new.event_id and event.integration_id = new.integration_id and event.profile_id = new.profile_id)
    then raise exception 'marketing_systeme_event_profile_mismatch' using errcode = '23514'; end if;
  elsif tg_table_name = 'marketing_systeme_discovered_fields' then
    if new.source_page_url <> '' and (
      new.source_page_url !~ '^https?://[^/?#[:space:]@]+(/[^?#[:space:]]*)?$'
      or right(new.source_page_url, 1) = '/'
      or substring(new.source_page_url from '^https?://([^/]+)') <>
        lower(substring(new.source_page_url from '^https?://([^/]+)'))
    ) then raise exception 'marketing_systeme_invalid_page_url' using errcode = '23514'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists marketing_systeme_flows_validate on public.marketing_systeme_flows;
create trigger marketing_systeme_flows_validate before insert or update on public.marketing_systeme_flows
  for each row execute function public.validate_marketing_systeme_flow();

-- Only new extension tables receive triggers, grants and policies.
do $$
declare v_table text;
begin
  foreach v_table in array array[
    'marketing_systeme_flows', 'marketing_systeme_field_bindings',
    'marketing_systeme_discovered_fields', 'marketing_systeme_contact_fields', 'marketing_systeme_event_context'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on table public.%I from public, anon, authenticated', v_table);
    execute format('grant select on table public.%I to authenticated', v_table);
    execute format('grant all on table public.%I to service_role', v_table);
    execute format('drop policy if exists %I on public.%I', v_table || '_owner_read', v_table);
    execute format('create policy %I on public.%I for select to authenticated using (profile_id = public.current_profile_id() or public.is_super_admin())',
      v_table || '_owner_read', v_table);
    if v_table <> 'marketing_systeme_flows' then
      execute format('drop trigger if exists %I on public.%I', v_table || '_validate_owner', v_table);
      execute format('create trigger %I before insert or update on public.%I for each row execute function public.validate_marketing_systeme_extension_owner()',
        v_table || '_validate_owner', v_table);
    end if;
    if v_table in ('marketing_systeme_flows', 'marketing_systeme_field_bindings', 'marketing_systeme_contact_fields') then
      execute format('drop trigger if exists %I on public.%I', v_table || '_updated_at', v_table);
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
        v_table || '_updated_at', v_table);
    end if;
  end loop;
end;
$$;

-- Prepare a faithful copy of existing settings, but keep routing_mode=legacy.
insert into public.marketing_systeme_flows (
  integration_id, profile_id, name, enabled, import_mode, allowed_page_urls, destination_stage_id
)
select connection.id, connection.profile_id, 'Flusso iniziale', connection.enabled, connection.import_mode,
  case when connection.import_mode = 'all' then '{}'::text[] else connection.allowed_page_urls end,
  connection.destination_stage_id
from public.marketing_systeme_integrations connection
where connection.routing_mode = 'legacy'
  and not exists (select 1 from public.marketing_systeme_flows flow where flow.integration_id = connection.id);

revoke all on function public.validate_marketing_systeme_flow() from public, anon, authenticated;
revoke all on function public.validate_marketing_systeme_extension_owner() from public, anon, authenticated;
revoke all on function public.marketing_systeme_warnings_valid(jsonb) from public, anon, authenticated;
grant execute on function public.validate_marketing_systeme_flow() to service_role;
grant execute on function public.validate_marketing_systeme_extension_owner() to service_role;
grant execute on function public.marketing_systeme_warnings_valid(jsonb) to service_role;

commit;
