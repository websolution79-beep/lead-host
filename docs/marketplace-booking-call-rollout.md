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
2. Wallet migration applied and verified read-only: readiness v2, disabled/zero configuration, no booking rows; client execution denied. No production writes.
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

## Step 3: notifications and operational workflow (prepared, not deployed)

Apply `202611020003_marketplace_booking_call_workflow.sql` after migrations 1
and 2. It only adds guarded commands, an assignment-specific queue trigger and
readiness v3. It does not enable booking, alter prices, generate bookings,
send emails, or replace existing purchase/refund functions. RLS remains enabled
with no client access. The transaction uses a 3-second lock timeout and a
30-second statement timeout; a lock timeout rolls it back safely.

The context helper containing contacts is private even from service_role.
Guarded task read/update/retry functions accept only the authenticated actor
supplied by server APIs, then recheck active profile and either superadmin or
the active assigned team member. Members cannot read another coordinator's
booking. Appointment changes never alter owner-lead activity or compensation.
The task is reachable from the operational email and independently within a
sold lead detail, not by adding heavy queries to the pipeline/list load.

The worker obtains one fresh three-minute lease at a time, verifies the paid
purchase and matching wallet debit, and sends the separate PM receipt plus an
operational email to the active coordinator. If unavailable, recipients are
only active superadmins, not every team member. Unresolved qualifier attribution
is described explicitly; it is never silently given to an admin/promoter.
Current lease and refund state are re-read before operational delivery.
Reassignment invalidates old leases and queues the appropriate recipient.

Successful recipient/purchase/template deliveries are checked in delivery logs;
the provider receives stable idempotency keys. A partial failure retries only
missing recipients. Provider-unconfigured failures remain pending, whereas an
explicitly disabled email template is respected. A lease becoming stale is
not sufficient to permanently skip an unsent job. There remains an unavoidable
external-service race if a refund occurs after the final read while an email
request is already in flight; already-sent mail cannot be recalled.

User decision on 2 November: **retain the existing daily cron and manual retry**.
The Vercel project is Hobby. No schedule, plan, Make scenario or environment
variable has been changed. Booking delivery is immediate after a confirmed
purchase; the daily cron processes one recovery job per invocation. The booking
task has a manual retry button for faster recovery and avoids retrying a fresh
active lease. New cron processing requires the existing configured CRON_SECRET.
This bounded daily fallback is not a five-minute or unlimited-backlog recovery
guarantee. Persisted sent logs and provider idempotency protect normal retries;
the provider's idempotency retention window is not indefinite.

New default templates appear as `lead.booking_call_purchased` and
`team.booking_call_requested` in the existing Email groups. Existing saved
template text and enabled flags remain untouched. Existing admin purchase mail
accepts an optional booking label; ordinary purchases retain their old copy.
No refund-notification template is added.

Booking is also included in Team/earnings filters, labels and CSV exports.
The admin pending-attribution endpoint checks that the selected event belongs
to the booking, then uses the dedicated paired-attribution command for original
and reversal, not the generic compensation command. Existing activity types
keep their existing attribution path.

Prepared server purchase API enforces current terms, a strict body, expected
components, integer bounds and authenticated buyer identity. It delegates
atomic debit and idempotency to SQL; a cache invalidation failure cannot turn a
completed purchase into an apparent payment failure. Unconfirmed responses
explicitly require the same request UUID, not an automatic replacement charge.

### Step 3 checks

- 186 isolated PostgreSQL assertions across wallet, refund, workflow, lease,
  permission, fallback, scheduling, pending attribution and unchanged legacy
  function behavior. Both new migrations are tested when applied twice.
- 28 unit tests including configuration, recovery after partial delivery,
  missing/disabled templates, no team-wide broadcast and preserved admin texts.
- Nine actual-handler VM tests: authentication/authorization, buyer spoofing,
  malformed/overflow requests, business/transport errors, actor binding, manual
  retry and paired attribution. No real network or database writes.
- Scoped TypeScript and ESLint checks; mocked Playwright UI at desktop 1440px
  and mobile 390/320px, no horizontal overflow or page errors. Scheduling
  converts 16:30 Italy to 15:30 UTC in November. Temporary QA route is removed.
- No live email, wallet purchase, refund or appointment has been executed.

### Next operation / activation gate

After migration 3 is applied, verify readiness v3 read-only. Next implement the
public-only premium purchase action, itemized confirmation, stable request-ID
recovery UI, and the persistent PM notice in My Leads while retaining contacts.
Then test the complete public purchase/refund flow and concurrent clients on
an isolated staging database, preview, and controlled release. The production
service remains disabled; the current staged code is not a finished PM rollout.

## Step 4: public purchase UI and PM notices (prepared, not deployed)

Migration 3 has been verified live read-only: readiness v3, engine/workflow
ready, enabled false, fee zero, no booking rows; anonymous readiness execution
is denied with 42501. No production setting, wallet or purchase was modified.

The public Marketplace detail now passes an optional booking quote at the
effective exclusive price. The gold action sits below the unchanged ordinary
purchase action and itemizes lead price, booking supplement and wallet total.
Private Prime Zone does not receive the prop and never renders the option.
The server still independently authorizes public/exclusive availability and
all prices; the browser quote is not a payment authorization.

Before submission the browser stores only the attempt version, UUID and two
component prices in sessionStorage, keyed by authenticated user and lead. A
network failure or malformed success retains that same request across page
reloads. Recovery can replay it even when the service is subsequently disabled
or the lead has become unavailable. No replacement UUID or automatic retry is
generated for an unconfirmed request. Confirmed SQL business failures can be
corrected; a price change requires new explicit terms acceptance. An unreadable
existing attempt blocks new purchase actions pending verification. A blocked
browser store without evidence of an earlier attempt disables booking only,
not the ordinary purchase path. An in-flight booking prevents simultaneous
ordinary purchase from the same widget; the database remains the authority
across tabs/devices. A confirmed receipt triggers one existing lead_purchase
browser event, using the purchase UUID for event identity.

My Leads reads booking summaries in batches of at most 100 purchase UUIDs,
filtered by both server-authenticated PM and the purchases already owned by
that PM. Only status/date/component prices are returned, not team contact or
qualification details. Missing pre-foundation storage is compatible; real
booking query failures produce an error instead of silently suppressing the
wait-for-team notice. The list and detail both display the notice; detail puts
it before property information so it is immediately visible on mobile.
Phone and email links remain visible. A scheduled task shows the appointment
in Europe/Rome time. Ordinary purchases keep their existing layout and endpoint.
The success panel remains visible if a refresh marks a purchased lead sold.

### Step 4 checks and remaining release gate

- 34 unit tests across booking and existing pricing/template behavior;
  13 actual-handler VM tests including owned-purchase filtering, contacts,
  refund exclusion, unavailable booking storage and unchanged ordinary records.
- Repeated isolated wallet/workflow suite: 186 PostgreSQL checks, no live
  purchases, refunds, emails or compensation entries created.
- Mocked Playwright at 1440, 390 and 320px: purchase/confirmation/list/detail,
  visible contacts, single request/event, refresh after sale, lost and malformed
  responses, replay with service disabled, corrupt/unavailable browser storage,
  changed prices requiring acceptance, insufficient credit, ordinary purchase
  and Prime Zone exclusion. No horizontal overflow in the checked views.
- Scoped TypeScript and ESLint. Temporary QA page removed before commit.

No additional migration is required for step 4. Next: preview/build validation,
final staging purchase/refund and concurrent-client checks, followed by a
controlled production release while keeping the setting disabled. Activation
requires an explicit positive fee and admin action after approval. Disabling
new bookings must retain the booking summaries/notices and processing of
existing tasks/refunds; do not drop booking tables or roll back to a pre-booking
UI after real bookings exist. No production release or activation performed.

## Step 5: Vercel preview verification, 2 November 2026

Code commit `204d8a89b96e31274bfb9d943e14926b19b52f10` was pushed only to
`codex/marketplace-booking-call`. Project/team/Git source were verified before
the push. Preview deployment `dpl_BGo2mBC9egXiACJseksSa7cDqAfa` reached READY:

- Immutable URL: https://lead-host-mi16nirky-websolution79-1327s-projects.vercel.app
- Branch alias: https://lead-host-git-codex-marketp-870fb9-websolution79-1327s-projects.vercel.app
- Build cloned the intended SHA, compiled Next.js, passed full TypeScript,
  generated 120 static pages and deployed successfully. QA fixture routes are
  absent from the build route manifest.
- Production remains `dpl_4A9Jk8kEbnoeW7wpVdAcyuZLH4qT` at
  `f4f4e512182480f7fe65e004a651dc641908c736` on `main`.
- Vercel protection remains `all_except_custom_domains`. The existing CLI
  login accessed the protected preview using its automated protection-bypass
  mechanism; protection was not disabled and no access token is shared here.

Remote unauthenticated smoke checks, without submitting valid purchase data:

| Request | Expected / actual |
| --- | --- |
| GET /login | 200 |
| GET /app/marketplace | 307 to the Lead Host login |
| GET /admin/impostazioni | 307 |
| POST /api/purchases/booking-call without authorization | 401, verified application-specific session error |
| GET /api/admin/booking-calls with a synthetic UUID, without authorization | 401 |
| GET /api/purchases/my-leads without authorization | 401 |

Re-ran 34 unit tests, 13 API handler tests, the 70-check foundation suite and
186-check wallet/workflow suite successfully. These financial tests are
isolated/mocked, not live purchases or email delivery. Read-only live readiness
still reports schema 3, engine/workflow ready, enabled false, fee zero and zero
booking rows. No live purchase, refund, compensation or email was created.

### Remaining gates / security finding

Authenticated remote PM/admin screens and a multi-connection PostgreSQL
concurrency test are not yet verified. PGlite is serialized and does not replace
that concurrency check. Do not label this as a completed live paid checkout.
Review authenticated settings/templates without enabling the global booking
flag; the preview uses the same operational database configuration.

The build reported dependency audit warnings. A separate read-only
`npm audit --omit=dev --json` reports 10 production dependency findings
(2 critical, 5 high, 3 moderate); direct packages include Next.js (critical)
and Zod (high). The current branch does not change package.json or its lockfile
relative to production, so this is pre-existing, not a dependency introduced
by booking. Exploitability in this deployment has not been established.
Some proposed fixes include a major Zod upgrade; do not run automatic/forced
audit fixes on the live platform. Assess advisories and test any remediation
separately before production release/activation.
