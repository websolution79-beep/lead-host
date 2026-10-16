-- Additive foundation only. No integration is created or enabled by this migration.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table if not exists public.marketing_systeme_integrations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  import_mode text not null default 'all',
  allowed_page_urls text[] not null default '{}'::text[],
  destination_stage_id uuid references public.marketing_crm_stages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_systeme_integrations_identity unique (id, profile_id),
  constraint marketing_systeme_integrations_import_mode
    check (import_mode in ('all', 'selected_pages')),
  constraint marketing_systeme_integrations_page_count
    check (
      cardinality(allowed_page_urls) <= 50
      and array_position(allowed_page_urls, null) is null
      and coalesce(array_ndims(allowed_page_urls), 1) = 1
    ),
  constraint marketing_systeme_integrations_selected_pages
    check (import_mode <> 'selected_pages' or cardinality(allowed_page_urls) > 0)
);

-- Stored separately so browser clients cannot read signing secrets, even as admins.
-- The server will encrypt the secret before writing this value.
create table if not exists public.marketing_systeme_webhook_secrets (
  integration_id uuid primary key references public.marketing_systeme_integrations(id) on delete cascade,
  encrypted_secret text not null,
  rotated_at timestamptz not null default now(),
  constraint marketing_systeme_webhook_secrets_length
    check (char_length(encrypted_secret) between 32 and 4096)
);

create table if not exists public.marketing_systeme_contact_links (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null,
  profile_id uuid not null,
  external_contact_id text not null,
  crm_contact_id uuid not null references public.marketing_crm_contacts(id) on delete cascade,
  last_opt_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_systeme_contact_links_owner
    foreign key (integration_id, profile_id)
    references public.marketing_systeme_integrations(id, profile_id) on delete cascade,
  constraint marketing_systeme_contact_links_external_unique
    unique (integration_id, external_contact_id),
  constraint marketing_systeme_contact_links_external_id_length
    check (char_length(btrim(external_contact_id)) between 1 and 160)
);

create index if not exists marketing_systeme_contact_links_contact_idx
  on public.marketing_systeme_contact_links (crm_contact_id);

-- A message ID is stable across delivery retries. No full payload or contact email
-- is copied into this log; it records outcomes and links to the private CRM.
create table if not exists public.marketing_systeme_webhook_events (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null,
  profile_id uuid not null,
  message_id text not null,
  event_type text not null,
  payload_sha256 text not null,
  status text not null default 'received',
  reason_code text,
  external_contact_id text,
  source_page_url text,
  crm_contact_id uuid references public.marketing_crm_contacts(id) on delete set null,
  event_occurred_at timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint marketing_systeme_webhook_events_owner
    foreign key (integration_id, profile_id)
    references public.marketing_systeme_integrations(id, profile_id) on delete cascade,
  constraint marketing_systeme_webhook_events_message_unique
    unique (integration_id, message_id),
  constraint marketing_systeme_webhook_events_message_length
    check (char_length(btrim(message_id)) between 1 and 160),
  constraint marketing_systeme_webhook_events_type_length
    check (char_length(btrim(event_type)) between 1 and 80),
  constraint marketing_systeme_webhook_events_payload_sha256
    check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  constraint marketing_systeme_webhook_events_status
    check (status in ('received', 'imported', 'updated', 'ignored', 'failed')),
  constraint marketing_systeme_webhook_events_reason_length
    check (reason_code is null or char_length(reason_code) between 1 and 80),
  constraint marketing_systeme_webhook_events_external_id_length
    check (external_contact_id is null or char_length(btrim(external_contact_id)) between 1 and 160),
  constraint marketing_systeme_webhook_events_source_length
    check (source_page_url is null or char_length(source_page_url) <= 2048),
  constraint marketing_systeme_webhook_events_processed
    check (
      (status = 'received' and processed_at is null)
      or (status <> 'received' and processed_at is not null)
    )
);

create index if not exists marketing_systeme_webhook_events_recent_idx
  on public.marketing_systeme_webhook_events (integration_id, received_at desc);

create index if not exists marketing_systeme_webhook_events_contact_idx
  on public.marketing_systeme_webhook_events (crm_contact_id)
  where crm_contact_id is not null;

-- These triggers belong only to the new tables. Existing CRM writes are unchanged.
create or replace function public.validate_marketing_systeme_destination()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_page_url text;
begin
  if new.destination_stage_id is not null and not exists (
    select 1
    from public.marketing_crm_stages stage
    join public.marketing_crm_pipelines pipeline on pipeline.id = stage.pipeline_id
    where stage.id = new.destination_stage_id
      and pipeline.profile_id = new.profile_id
  ) then
    raise exception 'marketing_systeme_destination_profile_mismatch'
      using errcode = '23514';
  end if;

  foreach v_page_url in array new.allowed_page_urls loop
    if v_page_url is null
      or char_length(v_page_url) > 2048
      or v_page_url !~ '^https?://[^/?#[:space:]]+(/[^?#[:space:]]*)?$'
    then
      raise exception 'marketing_systeme_invalid_page_url'
        using errcode = '23514';
    end if;
  end loop;

  return new;
end;
$$;

create or replace function public.validate_marketing_systeme_contact_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.crm_contact_id is not null and not exists (
    select 1 from public.marketing_crm_contacts contact
    where contact.id = new.crm_contact_id
      and contact.profile_id = new.profile_id
  ) then
    raise exception 'marketing_systeme_contact_profile_mismatch'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists marketing_systeme_integrations_validate_destination on public.marketing_systeme_integrations;
create trigger marketing_systeme_integrations_validate_destination
before insert or update of profile_id, destination_stage_id, allowed_page_urls
on public.marketing_systeme_integrations
for each row execute function public.validate_marketing_systeme_destination();

drop trigger if exists marketing_systeme_contact_links_validate_owner on public.marketing_systeme_contact_links;
create trigger marketing_systeme_contact_links_validate_owner
before insert or update of profile_id, crm_contact_id
on public.marketing_systeme_contact_links
for each row execute function public.validate_marketing_systeme_contact_owner();

drop trigger if exists marketing_systeme_webhook_events_validate_owner on public.marketing_systeme_webhook_events;
create trigger marketing_systeme_webhook_events_validate_owner
before insert or update of profile_id, crm_contact_id
on public.marketing_systeme_webhook_events
for each row execute function public.validate_marketing_systeme_contact_owner();

drop trigger if exists marketing_systeme_integrations_updated_at on public.marketing_systeme_integrations;
create trigger marketing_systeme_integrations_updated_at
before update on public.marketing_systeme_integrations
for each row execute function public.set_updated_at();

drop trigger if exists marketing_systeme_contact_links_updated_at on public.marketing_systeme_contact_links;
create trigger marketing_systeme_contact_links_updated_at
before update on public.marketing_systeme_contact_links
for each row execute function public.set_updated_at();

alter table public.marketing_systeme_integrations enable row level security;
alter table public.marketing_systeme_webhook_secrets enable row level security;
alter table public.marketing_systeme_contact_links enable row level security;
alter table public.marketing_systeme_webhook_events enable row level security;

revoke all on table public.marketing_systeme_integrations,
  public.marketing_systeme_webhook_secrets,
  public.marketing_systeme_contact_links,
  public.marketing_systeme_webhook_events from public, anon, authenticated;

grant select on table public.marketing_systeme_integrations,
  public.marketing_systeme_contact_links,
  public.marketing_systeme_webhook_events to authenticated;

grant all on table public.marketing_systeme_integrations,
  public.marketing_systeme_webhook_secrets,
  public.marketing_systeme_contact_links,
  public.marketing_systeme_webhook_events to service_role;

drop policy if exists marketing_systeme_integrations_owner_read on public.marketing_systeme_integrations;
create policy marketing_systeme_integrations_owner_read
on public.marketing_systeme_integrations for select to authenticated
using (profile_id = public.current_profile_id() or public.is_super_admin());

drop policy if exists marketing_systeme_contact_links_owner_read on public.marketing_systeme_contact_links;
create policy marketing_systeme_contact_links_owner_read
on public.marketing_systeme_contact_links for select to authenticated
using (profile_id = public.current_profile_id() or public.is_super_admin());

drop policy if exists marketing_systeme_webhook_events_owner_read on public.marketing_systeme_webhook_events;
create policy marketing_systeme_webhook_events_owner_read
on public.marketing_systeme_webhook_events for select to authenticated
using (profile_id = public.current_profile_id() or public.is_super_admin());

revoke all on function public.validate_marketing_systeme_destination() from public, anon, authenticated;
revoke all on function public.validate_marketing_systeme_contact_owner() from public, anon, authenticated;
grant execute on function public.validate_marketing_systeme_destination() to service_role;
grant execute on function public.validate_marketing_systeme_contact_owner() to service_role;

commit;
