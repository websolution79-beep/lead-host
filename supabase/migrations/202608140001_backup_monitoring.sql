create table if not exists public.backup_component_status (
  component text primary key,
  status text not null default 'unknown',
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  run_id text,
  run_url text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint backup_component_status_component_check check (
    component in ('database', 'storage', 'verification', 'repository')
  ),
  constraint backup_component_status_status_check check (
    status in ('success', 'failure', 'cancelled', 'skipped', 'unknown')
  )
);

alter table public.backup_component_status enable row level security;

revoke all on table public.backup_component_status from anon, authenticated;
grant all on table public.backup_component_status to service_role;

comment on table public.backup_component_status is
  'Sanitized latest status for external disaster recovery backups. Service role only.';

