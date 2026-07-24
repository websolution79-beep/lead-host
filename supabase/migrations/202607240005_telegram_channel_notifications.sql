create table if not exists telegram_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete set null,
  event_type text not null default 'lead.published',
  channel_id text not null,
  message_text text not null,
  provider_message_id text,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'failed', 'skipped')),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_type, lead_id)
);

create index if not exists telegram_delivery_logs_created_idx
  on telegram_delivery_logs (created_at desc);

create index if not exists telegram_delivery_logs_status_created_idx
  on telegram_delivery_logs (status, created_at desc);

drop trigger if exists telegram_delivery_logs_updated_at on telegram_delivery_logs;
create trigger telegram_delivery_logs_updated_at
before update on telegram_delivery_logs
for each row execute function set_updated_at();

alter table telegram_delivery_logs enable row level security;

revoke insert, update, delete on table telegram_delivery_logs from anon, authenticated;
grant select on table telegram_delivery_logs to authenticated;

drop policy if exists "telegram_delivery_logs_select_admin" on telegram_delivery_logs;
create policy "telegram_delivery_logs_select_admin"
on telegram_delivery_logs for select
to authenticated
using (is_super_admin());

insert into settings (key, value)
values (
  'telegram.channel_settings',
  jsonb_build_object(
    'enabled', false,
    'messageTemplate',
    E'NUOVA OPPORTUNITÀ SU LEAD HOST\n\n{{title}}\nLocalità: {{location}}\nTipologia: {{property_type}}\n\nCondiviso: {{shared_price}}\nEsclusiva: {{exclusive_price}}\nQuote disponibili: {{available_slots}}/{{max_shared_slots}}\n\nAccedi al marketplace e valuta il lead prima che venga acquistato.'
  )
)
on conflict (key) do nothing;
