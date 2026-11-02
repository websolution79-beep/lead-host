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

1. Foundation migration applied and verified read-only: empty booking/outbox tables, disabled/zero config, anonymous RPC denied with 42501. No production writes.
2. Prepared `202611020002_marketplace_booking_call_wallet.sql`, described below. Apply and verify before connecting HTTP/UI consumers.
3. Integrate the new ledger event type with the existing earnings views/labels. Accrual is purchase-time and idempotent by purchase; paid-out compensation is adjusted through a negative event, not by deleting payment history.
4. Add price configuration, public-only premium purchase action, itemized confirmation, my-leads notice and basic appointment state management. Update existing PM purchase copy conditionally without overwriting customized templates.
5. Add the new Team/Admin transactional template, scoped recipient and idempotent worker/retry using the outbox. Recheck refunded purchases before sending; no separate refund email is requested.
6. Isolated purchase/refund/concurrency, role and UI tests, followed by preview and controlled rollout. Leave the feature disabled until the complete flow is verified.

## Step 2: atomic wallet and compensation commands

`purchase_exclusive_lead_with_booking_call` is a new service-only command. It
does not replace the existing purchase RPC. It validates active PM ownership,
public visibility, exclusive availability, current promotional lead price,
separate service fee, integer overflow, terms presence and the full wallet balance.
The existing marketplace-membership insert guard remains effective.

The command writes a single completed wallet debit for the full total, one
exclusive purchase, component snapshots, terms evidence, a 300-cent compensation
and the durable booking/email job inside one transaction. No HTTP/email calls
run inside SQL. The client-generated request UUID is the booking ID; reuse it on
retries. A repeat returns the original purchase without another debit, event or
email job. A refunded request cannot silently initiate a replacement purchase.
Future HTTP handlers must obtain profile/PM identifiers from authenticated
server context, never from a client-supplied buyer identifier, and enforce the
current terms version.

Qualification uses only a confirmed verification claim linked to a non-voided
accrued verification event. Missing claims produce pending attribution, never a
guess based on first worker/promoter/PM account manager. An inactive qualifier
retains the compensation attribution, but the coordinator is left unassigned
for admin handling. Reassigning operational work does not transfer that reward.

The new refund trigger only processes completed refund wallet inserts with a
matching booking. It verifies the paid refund, refunded purchase, full total
including service fee, buyer/wallet ownership and original booking event.
It inserts exactly one negative booking adjustment and cancels unsent booking
jobs; qualification events and recorded payouts stay intact. Ordinary refunds
perform one indexed lookup and retain their existing behavior. The booking
flag does not suppress reversals of already earned rewards.

`attribute_booking_call_compensation` resolves a missing qualifier with explicit
active-superadmin authorization. Original and negative pending events are
attributed together, including after a refund. A narrow ledger trigger rejects
the old generic attribution command for these events. The future admin HTTP/UI
integration MUST route booking attributions to this dedicated command.

Refund and attribution serialize by the advisory key
`hashtextextended('booking_call:' || booking_id, 0)` before booking-row/member
locks. Member advisory keys match existing payout serialization. New booking
operations must preserve this lock protocol. The compensated member is immutable
after attribution; refunds use appended adjustments, not event/payment deletion.

The compensation-type constraint is widened while preserving its existing
expression, rather than replacing the list of unrelated allowed event types.
The read-only readiness v2 RPC reports the installed engine without activating
it. Both original wallet RPC definitions stay unchanged.

### Step 2 checks and limits

- 139 isolated PostgreSQL assertions, using the actual legacy purchase/refund,
  membership, promotional pricing, compensation and payout SQL implementations.
- Repeated migration, function-definition equality, denied client execution,
  price-component changes, insufficient full balance, public-only/exclusive
  rules, failure at the last write rolling back everything, retry identity,
  full refund, repeated refund, missing/voided qualifier claims, inactive
  coordinator fallback, paired attribution, discounts on the lead only,
  PRIME membership on a public purchase, existing promoter compensation,
  and refund after the booking event itself has a completed payout allocation.
- PGlite serializes queries: this is not a two-connection production concurrency
  stress test. Lock ordering has been reviewed; staged concurrent-client testing
  remains a pre-activation requirement.
- Nine booking configuration/wallet unit tests. The unused wallet helper treats
  lost/malformed responses as unconfirmed, never as permission to auto-charge
  again with a fresh request ID.
- No new public HTTP purchase handler, price editor, earnings label, template or
  email worker is active yet. No production purchase/refund was executed.

## Deployment safety

Apply only the numbered migration, not a schema reset. The transaction has a 3-second lock timeout and 20-second statement timeout: if busy, it rolls back instead of waiting indefinitely. Foreign keys still require brief metadata locks on referenced tables; choose a quiet moment and retry on a lock-timeout error.
Do not enable the setting manually during step 1. A schema version is not permission to activate the unfinished purchase flow.
No new Stripe product, card checkout or subscription is involved in this wallet-only service.
