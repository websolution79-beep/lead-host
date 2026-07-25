create table if not exists tracking_event_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null
    check (provider in ('meta', 'ga4', 'hotjar')),
  event_name text not null
    check (char_length(event_name) between 1 and 80),
  event_id text
    check (event_id is null or char_length(event_id) between 1 and 160),
  source text not null
    check (source in ('browser', 'server', 'hybrid', 'test')),
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'failed', 'skipped')),
  page_path text
    check (page_path is null or char_length(page_path) <= 500),
  value_cents integer
    check (value_cents is null or value_cents >= 0),
  currency text
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  error_message text,
  occurred_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tracking_event_logs_provider_event_id_uidx
  on tracking_event_logs (provider, event_id)
  where event_id is not null;

create index if not exists tracking_event_logs_created_idx
  on tracking_event_logs (created_at desc);

create index if not exists tracking_event_logs_provider_created_idx
  on tracking_event_logs (provider, created_at desc);

create index if not exists tracking_event_logs_event_created_idx
  on tracking_event_logs (event_name, created_at desc);

create index if not exists tracking_event_logs_status_created_idx
  on tracking_event_logs (status, created_at desc);

drop trigger if exists tracking_event_logs_updated_at on tracking_event_logs;
create trigger tracking_event_logs_updated_at
before update on tracking_event_logs
for each row execute function set_updated_at();

drop trigger if exists settings_updated_at on settings;
create trigger settings_updated_at
before update on settings
for each row execute function set_updated_at();

alter table tracking_event_logs enable row level security;

revoke all on table tracking_event_logs from anon, authenticated;
grant select on table tracking_event_logs to authenticated;

drop policy if exists "tracking_event_logs_select_admin" on tracking_event_logs;
create policy "tracking_event_logs_select_admin"
on tracking_event_logs for select
to authenticated
using (is_super_admin());

insert into settings (key, value)
values (
  'tracking.configuration',
  jsonb_build_object(
    'version', 1,
    'providers', jsonb_build_object(
      'meta', jsonb_build_object(
        'enabled', false,
        'pixelId', '',
        'scopes', jsonb_build_object(
          'public', true,
          'pm', false,
          'admin', false
        )
      ),
      'ga4', jsonb_build_object(
        'enabled', false,
        'measurementId', '',
        'scopes', jsonb_build_object(
          'public', true,
          'pm', false,
          'admin', false
        )
      ),
      'hotjar', jsonb_build_object(
        'enabled', false,
        'siteId', '',
        'scopes', jsonb_build_object(
          'public', true,
          'pm', false,
          'admin', false
        )
      )
    ),
    'events', jsonb_build_object(
      'page_view', jsonb_build_object(
        'enabled', false,
        'providers', jsonb_build_array('meta', 'ga4')
      ),
      'view_content', jsonb_build_object(
        'enabled', false,
        'providers', jsonb_build_array('meta', 'ga4', 'hotjar')
      ),
      'telegram_join_click', jsonb_build_object(
        'enabled', false,
        'providers', jsonb_build_array('meta', 'ga4', 'hotjar')
      ),
      'lead', jsonb_build_object(
        'enabled', false,
        'providers', jsonb_build_array('meta', 'ga4')
      ),
      'complete_registration', jsonb_build_object(
        'enabled', false,
        'providers', jsonb_build_array('meta', 'ga4')
      ),
      'initiate_checkout', jsonb_build_object(
        'enabled', false,
        'providers', jsonb_build_array('meta', 'ga4')
      ),
      'purchase', jsonb_build_object(
        'enabled', false,
        'providers', jsonb_build_array('meta', 'ga4')
      ),
      'lead_purchase', jsonb_build_object(
        'enabled', false,
        'providers', jsonb_build_array('meta', 'ga4')
      )
    )
  )
)
on conflict (key) do nothing;
