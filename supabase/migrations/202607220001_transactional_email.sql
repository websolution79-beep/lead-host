create table if not exists email_preferences (
  profile_id uuid primary key references profiles(id) on delete cascade,
  new_lead_frequency text not null default 'immediate'
    check (new_lead_frequency in ('immediate', 'daily', 'every_3_days', 'off')),
  transactional_enabled boolean not null default true,
  last_lead_digest_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists email_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete set null,
  property_manager_id uuid references property_manager_profiles(id) on delete set null,
  owner_request_id uuid references owner_requests(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  lead_purchase_id uuid references lead_purchases(id) on delete set null,
  recipient_email text not null,
  event_type text not null,
  provider text not null default 'resend',
  provider_message_id text,
  subject text not null,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'failed', 'skipped')),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_delivery_logs_profile_created_idx
  on email_delivery_logs (profile_id, created_at desc);

create index if not exists email_delivery_logs_event_created_idx
  on email_delivery_logs (event_type, created_at desc);

drop trigger if exists email_preferences_updated_at on email_preferences;
create trigger email_preferences_updated_at
before update on email_preferences
for each row execute function set_updated_at();

alter table email_preferences enable row level security;
alter table email_delivery_logs enable row level security;

drop policy if exists "email_preferences_select_own_or_admin" on email_preferences;
create policy "email_preferences_select_own_or_admin"
on email_preferences for select
to authenticated
using (profile_id = current_profile_id() or is_super_admin());

drop policy if exists "email_preferences_upsert_own_or_admin" on email_preferences;
create policy "email_preferences_upsert_own_or_admin"
on email_preferences for all
to authenticated
using (profile_id = current_profile_id() or is_super_admin())
with check (profile_id = current_profile_id() or is_super_admin());

drop policy if exists "email_delivery_logs_select_own_or_admin" on email_delivery_logs;
create policy "email_delivery_logs_select_own_or_admin"
on email_delivery_logs for select
to authenticated
using (profile_id = current_profile_id() or is_super_admin());
