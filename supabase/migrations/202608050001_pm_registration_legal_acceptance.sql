-- Record the required Privacy/Terms acknowledgement made during PM signup.
alter table public.terms_acceptances
  drop constraint if exists terms_acceptances_context_check;

alter table public.terms_acceptances
  add constraint terms_acceptances_context_check
  check (context in ('wallet_top_up', 'lead_purchase', 'account_registration'));

alter table public.terms_acceptances
  drop constraint if exists terms_acceptance_context_reference;

alter table public.terms_acceptances
  add constraint terms_acceptance_context_reference check (
    (context = 'wallet_top_up' and wallet_transaction_id is not null and lead_purchase_id is null)
    or
    (context = 'lead_purchase' and lead_purchase_id is not null and wallet_transaction_id is null)
    or
    (context = 'account_registration' and wallet_transaction_id is null and lead_purchase_id is null)
  );

create unique index if not exists terms_acceptances_account_registration_unique
  on public.terms_acceptances (profile_id)
  where context = 'account_registration';
