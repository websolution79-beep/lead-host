# Marketplace exclusive purchase with booking call

## Agreed rules

- Public Marketplace only, also for PRIME members buying there; never private Prime Zone.
- Keep the ordinary exclusive purchase unchanged. Booking is an optional service attached to an exclusive purchase, not a new shared/exclusive enum.
- Admin sets the supplement under Prezzi default lead / Costo booking Call.
- Debit the full quoted total from the wallet atomically with the exclusive purchase and booking record.
- Keep owner contacts visible, with a prominent instruction to wait for Lead Host to organize the introductory call.
- EUR 3.00 accrues at purchase to the confirmed qualifier, not the first worker, promoter, PM account manager or whoever later edits the appointment.
- Qualifier receives a transactional operational email with both parties' contact details. Missing/inactive recipients require explicit admin fallback, not silent arbitrary attribution or a team-wide broadcast.
- A completed wallet refund returns the whole purchase total, including the booking fee, and reverses this booking compensation once. Do not add new reversals to lead-verification compensation or alter other existing refund rules.

## Step 1: dormant foundation

Migration `202611020001_marketplace_booking_call_foundation.sql` only adds:

- Two default settings, disabled/zero, without overwriting existing configuration.
- A service-only booking table with original component prices, qualifier/coordinator, claim reference, fixed 300-cent compensation snapshot and original/reversal ledger references.
- A service-only email outbox for durable delivery and leases.
- A service-role-only read-only readiness RPC. Missing or malformed configuration fails closed.

Both new tables have RLS enabled and no anon/authenticated policies or grants.
Service role has SELECT only at this stage; future validated SECURITY DEFINER commands will own writes.
No existing purchase/refund functions, triggers, compensation type constraints, balances, events or historical sales are changed. No booking jobs or commissions are generated merely by applying this migration. No UI/API uses the helper yet.

The qualifier snapshot and operational coordinator are separate: later operational reassignment must not silently transfer already accrued compensation.
Nullable attribution allows legacy leads without a confirmed claim to be flagged for explicit resolution, never attributed using the first-work badge.

The pure quote helper validates integer cents, public visibility, exclusive availability and overflow. It does not authorize payments; the future transactional command must recheck all of these server-side.

### Foundation checks

`scripts/test-booking-call-foundation-db.mjs` uses an isolated PGlite database,
never application credentials. It requires an available optional `@electric-sql/pglite`
module (or its import URL in `PGLITE_MODULE`); it adds no application dependency.
70 assertions passed, including repeated application, unchanged legacy functions,
new-table RLS/grants, denied client access, amount/lease constraints and malformed
configuration. Eight quote/settings unit tests passed. No production reads or writes.

## Following steps

1. User applies this preparatory migration; verify installation read-only.
2. Add a dedicated, backward-compatible transactional booking purchase command, durable attribution/email enqueue and narrowly scoped booking refund reconciliation. Do not split wallet debit into remote API operations.
3. Integrate the new ledger event type with the existing earnings views/labels. Accrual is purchase-time and idempotent by purchase; paid-out compensation is adjusted through a negative event, not by deleting payment history.
4. Add price configuration, public-only premium purchase action, itemized confirmation, my-leads notice and basic appointment state management. Update existing PM purchase copy conditionally without overwriting customized templates.
5. Add the new Team/Admin transactional template, scoped recipient and idempotent worker/retry using the outbox. Recheck refunded purchases before sending; no separate refund email is requested.
6. Isolated purchase/refund/concurrency, role and UI tests, followed by preview and controlled rollout. Leave the feature disabled until the complete flow is verified.

## Deployment safety

Apply only the numbered migration, not a schema reset. The transaction has a 3-second lock timeout and 20-second statement timeout: if busy, it rolls back instead of waiting indefinitely. Foreign keys still require brief metadata locks on referenced tables; choose a quiet moment and retry on a lock-timeout error.
Do not enable the setting manually during step 1. A schema version is not permission to activate the unfinished purchase flow.
No new Stripe product, card checkout or subscription is involved in this wallet-only service.
