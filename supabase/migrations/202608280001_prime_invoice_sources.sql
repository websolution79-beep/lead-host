-- Extend the existing Aruba invoice archive to support PRIME billing periods.
-- This migration is additive and does not enable automatic PRIME generation.

alter table public.billing_invoices
  alter column wallet_transaction_id drop not null;

alter table public.billing_invoices
  add column if not exists source_type text not null default 'wallet_top_up',
  add column if not exists prime_billing_period_id uuid
    references public.prime_billing_periods(id) on delete restrict,
  add column if not exists line_items jsonb not null default '[]'::jsonb;

update public.billing_invoices
set source_type = 'wallet_top_up'
where source_type is distinct from 'wallet_top_up'
  and wallet_transaction_id is not null;

update public.billing_invoices
set line_items = jsonb_build_array(
  jsonb_build_object(
    'code', 'wallet_top_up',
    'description', coalesce(
      nullif(issuer_snapshot ->> 'lineDescription', ''),
      'Ricarica wallet Lead Host'
    ),
    'amountCents', amount_cents
  )
)
where wallet_transaction_id is not null
  and line_items = '[]'::jsonb;

alter table public.billing_invoices
  drop constraint if exists billing_invoices_source_type_check,
  drop constraint if exists billing_invoices_single_source_check,
  drop constraint if exists billing_invoices_line_items_check;

alter table public.billing_invoices
  add constraint billing_invoices_source_type_check
    check (source_type in ('wallet_top_up', 'prime_billing')),
  add constraint billing_invoices_single_source_check
    check (
      (
        source_type = 'wallet_top_up'
        and wallet_transaction_id is not null
        and prime_billing_period_id is null
      )
      or
      (
        source_type = 'prime_billing'
        and wallet_transaction_id is null
        and prime_billing_period_id is not null
      )
    ),
  add constraint billing_invoices_line_items_check
    check (jsonb_typeof(line_items) = 'array');

create unique index if not exists billing_invoices_prime_period_unique_idx
  on public.billing_invoices (prime_billing_period_id)
  where prime_billing_period_id is not null;

create index if not exists billing_invoices_source_created_idx
  on public.billing_invoices (source_type, created_at desc);

comment on column public.billing_invoices.source_type is
  'Business source of the invoice: Wallet top-up or PRIME billing period.';

comment on column public.billing_invoices.prime_billing_period_id is
  'Idempotent link to the paid PRIME period that originated the invoice.';

comment on column public.billing_invoices.line_items is
  'Immutable invoice line snapshot used to generate the FatturaPA XML.';
