-- Prepare Marketplace invoices without enabling checkout or invoice generation.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter table public.billing_invoices
  add column if not exists marketplace_payment_id uuid;

alter table public.billing_invoices
  drop constraint if exists billing_invoices_marketplace_payment_fk;
alter table public.billing_invoices
  add constraint billing_invoices_marketplace_payment_fk
    foreign key (marketplace_payment_id) references public.addon_payments(id)
    on delete restrict not valid;

alter table public.billing_invoices
  drop constraint if exists billing_invoices_source_type_check,
  drop constraint if exists billing_invoices_single_source_check;

-- NOT VALID avoids scanning historical invoices while holding the DDL lock.
-- These constraints still apply to all new and modified rows.
alter table public.billing_invoices
  add constraint billing_invoices_source_type_check
    check (source_type in ('wallet_top_up', 'prime_billing', 'marketplace_subscription')) not valid,
  add constraint billing_invoices_single_source_check check (
    (source_type = 'wallet_top_up'
      and wallet_transaction_id is not null
      and prime_billing_period_id is null and marketplace_payment_id is null)
    or (source_type = 'prime_billing'
      and wallet_transaction_id is null
      and prime_billing_period_id is not null and marketplace_payment_id is null)
    or (source_type = 'marketplace_subscription'
      and wallet_transaction_id is null
      and prime_billing_period_id is null and marketplace_payment_id is not null)
  ) not valid;

create unique index if not exists billing_invoices_marketplace_payment_unique_idx
  on public.billing_invoices (marketplace_payment_id)
  where marketplace_payment_id is not null;

comment on column public.billing_invoices.marketplace_payment_id is
  'Unique source payment for a Marketplace subscription invoice; no wallet credit.';

commit;

-- Validate historical rows separately from the short schema-change transaction.
alter table public.billing_invoices
  validate constraint billing_invoices_marketplace_payment_fk;
alter table public.billing_invoices
  validate constraint billing_invoices_source_type_check;
alter table public.billing_invoices
  validate constraint billing_invoices_single_source_check;
