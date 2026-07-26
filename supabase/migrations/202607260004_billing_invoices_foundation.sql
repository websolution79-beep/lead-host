do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'billing_invoice_status'
  ) then
    create type billing_invoice_status as enum (
      'pending',
      'generating',
      'ready',
      'downloaded',
      'imported',
      'sent',
      'error',
      'cancelled'
    );
  end if;
end $$;

create table if not exists billing_issuer_settings (
  id smallint primary key default 1 check (id = 1),
  legal_name text not null,
  vat_country_code text not null default 'IT',
  vat_number text not null,
  fiscal_code text not null,
  address_line text not null,
  postal_code text not null,
  city text not null,
  province text not null,
  country text not null default 'IT',
  email text not null,
  tax_regime text not null default 'RF19',
  tax_regime_description text not null,
  vat_rate numeric(5, 2) not null default 0,
  vat_nature text not null default 'N2.2',
  vat_reference text not null,
  document_type text not null default 'TD01',
  transmission_format text not null default 'FPR12',
  aruba_transmitter_tax_code text not null default '01879020517',
  currency text not null default 'EUR',
  line_description text not null default 'Ricarica wallet Lead Host',
  payment_method text not null default 'MP08',
  provisional_number_prefix text not null default 'LH-TMP',
  stamp_duty_threshold_cents integer not null default 7747,
  stamp_duty_amount_cents integer not null default 200,
  stamp_duty_absorbed boolean not null default true,
  auto_generate_invoices boolean not null default true,
  updated_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_issuer_vat_country_code_check
    check (vat_country_code ~ '^[A-Z]{2}$'),
  constraint billing_issuer_vat_number_check
    check (vat_number ~ '^[0-9]{11}$'),
  constraint billing_issuer_fiscal_code_check
    check (fiscal_code ~ '^[A-Z0-9]{11,16}$'),
  constraint billing_issuer_postal_code_check
    check (postal_code ~ '^[0-9]{5}$'),
  constraint billing_issuer_province_check
    check (province ~ '^[A-Z]{2}$'),
  constraint billing_issuer_country_check
    check (country ~ '^[A-Z]{2}$'),
  constraint billing_issuer_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint billing_issuer_stamp_threshold_check
    check (stamp_duty_threshold_cents >= 0),
  constraint billing_issuer_stamp_amount_check
    check (stamp_duty_amount_cents >= 0)
);

insert into billing_issuer_settings (
  id,
  legal_name,
  vat_country_code,
  vat_number,
  fiscal_code,
  address_line,
  postal_code,
  city,
  province,
  country,
  email,
  tax_regime,
  tax_regime_description,
  vat_rate,
  vat_nature,
  vat_reference,
  document_type,
  transmission_format,
  aruba_transmitter_tax_code,
  currency,
  line_description,
  payment_method,
  provisional_number_prefix,
  stamp_duty_threshold_cents,
  stamp_duty_amount_cents,
  stamp_duty_absorbed,
  auto_generate_invoices
) values (
  1,
  'SOGI DI DOMINICI ROMINA',
  'IT',
  '17750971008',
  'DMNRMN83D56H501A',
  'Via Cogliate 135',
  '00166',
  'Roma',
  'RM',
  'IT',
  'info@leadhost.it',
  'RF19',
  'Operazione senza applicazione dell''IVA ai sensi dell''art. 1, commi 54-89, L. 190/2014',
  0,
  'N2.2',
  'Operazione non soggetta a IVA - Regime forfettario L. 190/2014, art. 1, commi 54-89',
  'TD01',
  'FPR12',
  '01879020517',
  'EUR',
  'Ricarica wallet Lead Host',
  'MP08',
  'LH-TMP',
  7747,
  200,
  true,
  true
)
on conflict (id) do nothing;

create sequence if not exists billing_transmission_progressive_seq
  as bigint
  minvalue 1
  maxvalue 9999999999;

create table if not exists billing_invoices (
  id uuid primary key default gen_random_uuid(),
  wallet_transaction_id uuid not null unique
    references wallet_transactions(id) on delete restrict,
  payment_id uuid references payments(id) on delete set null,
  profile_id uuid not null references profiles(id) on delete restrict,
  status billing_invoice_status not null default 'pending',
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'EUR',
  provisional_number text,
  document_date date,
  transmission_progressive text not null unique default
    lpad(nextval('billing_transmission_progressive_seq')::text, 10, '0'),
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  issuer_snapshot jsonb not null default '{}'::jsonb,
  customer_snapshot jsonb not null default '{}'::jsonb,
  xml_content text,
  xml_sha256 text,
  stamp_duty_applied boolean not null default false,
  stamp_duty_amount_cents integer not null default 0,
  generation_attempts integer not null default 0,
  last_error text,
  generated_at timestamptz,
  downloaded_at timestamptz,
  imported_at timestamptz,
  sent_at timestamptz,
  final_invoice_number text,
  final_invoice_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_invoice_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint billing_invoice_progressive_check
    check (transmission_progressive ~ '^[A-Za-z0-9]{1,10}$'),
  constraint billing_invoice_stamp_amount_check
    check (stamp_duty_amount_cents >= 0)
);

create index if not exists billing_invoices_status_created_idx
  on billing_invoices (status, created_at desc);

create index if not exists billing_invoices_profile_created_idx
  on billing_invoices (profile_id, created_at desc);

create table if not exists billing_invoice_events (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references billing_invoices(id) on delete cascade,
  event_type text not null,
  actor_profile_id uuid references profiles(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists billing_invoice_events_invoice_created_idx
  on billing_invoice_events (invoice_id, created_at desc);

drop trigger if exists billing_issuer_settings_updated_at
  on billing_issuer_settings;
create trigger billing_issuer_settings_updated_at
before update on billing_issuer_settings
for each row execute function set_updated_at();

drop trigger if exists billing_invoices_updated_at
  on billing_invoices;
create trigger billing_invoices_updated_at
before update on billing_invoices
for each row execute function set_updated_at();

alter table billing_issuer_settings enable row level security;
alter table billing_invoices enable row level security;
alter table billing_invoice_events enable row level security;

drop policy if exists "billing_issuer_settings_admin_all"
  on billing_issuer_settings;
create policy "billing_issuer_settings_admin_all"
on billing_issuer_settings for all
to authenticated
using (is_super_admin())
with check (is_super_admin());

drop policy if exists "billing_invoices_admin_all"
  on billing_invoices;
create policy "billing_invoices_admin_all"
on billing_invoices for all
to authenticated
using (is_super_admin())
with check (is_super_admin());

drop policy if exists "billing_invoice_events_admin_select"
  on billing_invoice_events;
create policy "billing_invoice_events_admin_select"
on billing_invoice_events for select
to authenticated
using (is_super_admin());

drop policy if exists "billing_invoice_events_admin_insert"
  on billing_invoice_events;
create policy "billing_invoice_events_admin_insert"
on billing_invoice_events for insert
to authenticated
with check (is_super_admin());
