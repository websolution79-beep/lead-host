# Marketplace membership rollout

## Accepted behavior

- Paid access starts disabled. Existing PMs retain access to free areas and purchased leads.
- When enabled, public Marketplace requires an active membership/trial or valid PRIME access.
- PRIME includes public Marketplace through its actual access expiration, including its existing grace policy.
- Membership cancellation stops renewals at period end.
- Successful PRIME activation schedules cancellation of the PM's Marketplace subscription. No automatic refund and no automatic reactivation after PRIME ends.
- Card required for trial. Trial use is tracked once per PM/product.
- Catalog changes affect new subscriptions only, including the price agreed at trial signup.
- Reopening Marketplace does not cancel existing Stripe billing.

## Progress

- [x] Inspect current addon billing, PRIME access, marketplace routes and account deactivation.
- [x] Verify manual backup run 35059292006: database, storage, external verification and admin report all succeeded.
- [x] Prepare additive migration 202609160001, disabled settings and draft product.
- [x] Prepare pure, tested access and pricing policy; not wired into production routes.
- [x] Apply and verify foundation migration (draft product, disabled checkout and paid access).
- [x] Add Settings / Marketplace admin UI, audit and guarded activation. Settings JSON is the canonical configuration; catalog synchronization follows in the Stripe phase. Activation remains hard-disabled server-side.
- [x] Open Stripe dashboard for user login; create and verify linked Marketplace product through authenticated admin action.
- [x] Prepare immutable EUR monthly prices on admin save, storing the price ID atomically with the settings snapshot. Existing prices and subscriptions remain unchanged; checkout is still disabled.
- [x] Implement guarded Marketplace checkout: immutable price/terms/trial snapshots, one-use trial lookup, required card, unique local reservation and Stripe idempotency. Uncertain requests keep their reservation; only confirmed expired sessions release it.
- [ ] Implement webhook reconciliation, payment history and recovery of out-of-order events.
- [ ] Add offer page and server-side restrictions for lists, details, purchase APIs and database purchase functions/RLS.
- [x] Add Marketplace subscription status and confirmed period-end cancellation in PM profile, and account deactivation blocker for renewable Marketplace subscriptions. No renewal reactivation endpoint is provided.
- [ ] Add idempotent PRIME-triggered cancellation and retry/reconciliation (including simultaneous checkouts).
- [x] Prepare webhook reconciliation on paid PRIME invoices and Marketplace subscription/checkout events. Validate Stripe product and ownership before scheduling period-end cancellation; skip already cancelled renewals. Guarded by the rollout flag.
- [x] Add strict server access resolver preserving PRIME expiration/grace semantics; checkout aborts on PRIME lookup errors rather than assuming no PRIME access.
- [ ] Wire access resolver into all routes and database protections, and add periodic reconciliation/manual PRIME grant handling and in-progress checkout race recovery before activating the rollout flag.
- [x] Add server entitlement check to Wallet lead purchase API, including explicit handling for expiration between API check and database completion.
- [x] Prepare migration 202609170001: additive guard on new public lead purchases, using the same PRIME/trial/paid-period rules. Leaves the purchase RPC, historical completed purchases and refund transitions unchanged; short DDL timeout.
- [ ] Apply 202609170001 and verify database guard. Page/list/detail restrictions and periodic billing recovery still pending; do not enable paid access yet.
- [x] User applied 202609170001. Read-only RPC checks confirm both functions exist and open Marketplace returns no membership requirement. Purchase-trigger rejection has not been exercised against production.
- [x] Gate PM Marketplace listing/details before fetching lead payloads; preserve authorized staff view and purchased-lead routes. Add authenticated offer page with fixed-price checkout action still rollout-disabled, and PM view-counter gate.
- [ ] Verify responsive offer and authenticated access scenarios in browser, database rejection/rollback in isolated tests and periodic billing recovery before activation.
- [ ] Add Marketplace payments/admin subscribers, analytics, billing and email templates.
- [x] Inspect existing PRIME FatturaPA generation and prepare additive Marketplace invoice source migration 202609160002.
- [x] User applied 202609160002; read-only verification confirms the new column is queryable and the Marketplace payment/product join works. No test rows inserted.
- [x] Connect Marketplace paid invoices to the existing FatturaPA XML generator and issuer configuration, with customer/issuer snapshots, settled amounts and billed period. Automatic generation respects issuer settings.
- [x] Add Marketplace archive filter and manual generation/recovery endpoint. Existing XML downloads use the same invoice IDs. Unique payment linkage, conditional generation claim and finalized-document reuse protect retries; stale generation can recover after five minutes.
- [ ] Test initial paid signup, paid conversion after trial, renewals, duplicate and delayed webhooks, billing-data failures and recovery. Zero-value trial invoices and failed payments must not generate fiscal invoices.
- [ ] Verify desktop/mobile and integration scenarios before enabling checkout or paid access.

## Integration findings

### Marketplace transactional email phase

- [x] Add editable PM/superadmin templates for signup (including trial) and successful positive-value subscription payments.
- [x] Superadmin messages resolve only active profiles with the super_admin role. PM notifications skip inactive profiles; Marketing/PRIME templates are unchanged.
- [x] Use the stored signup amount and settled payment amount, not today's catalog price. Respect scheduled cancellation in customer copy.
- [x] Per-event/per-recipient sent-log checks plus Resend idempotency keys protect retries. Missing configuration and delivery failures remain retryable; deliberately disabled templates are respected.
- [x] Wire activation to checkout completion and subscription recovery; paid notifications to confirmed Marketplace invoices. All new sends remain rollout-disabled.
- [ ] Validate real delivery in an isolated environment; no live email sent during implementation. Payment failure/cancellation notices and long-term delivery recovery remain follow-up work.

### Admin reporting phase

- [x] Add a dedicated Marketplace tab in Admin Payments, keeping Marketing and PRIME records separate. It shows subscription status, trial/next charge, scheduled cancellation, paid history and total paid through the existing detail view.
- [x] Add Marketplace revenue and failed-payment KPI cards without affecting Wallet, lead sales, Marketing or PRIME totals.
- [x] Add Marketplace Analytics for the selected date range: new paid activations, renewals, paid revenue, unique paying PMs, current active/trialing subscriptions, scheduled cancellations and critical payments.
- [x] Keep PRIME out of Marketplace subscription revenue and counts because PRIME includes access without creating a Marketplace subscription.
- [x] No migration or production financial record change required; 32 Marketplace tests, lint and production build pass.

### Pending checkout recovery phase

- [x] Recover pending Marketplace sessions by persisted ID or Stripe customer/reference, validating product/profile/customer ownership before changes.
- [x] Expire an open Marketplace checkout when PRIME is already active; recover the current subscription when payment completion wins the expiration race.
- [x] Preserve uncertain reservations. Missing old sessions or multiple matching sessions require investigation, never automatic creation of a replacement subscription.
- [x] Include pending sessions without a Stripe subscription ID in the daily sweep; release local reservations only after confirmed expiration with a conditional database update.
- [x] Recheck PRIME immediately before returning a new Checkout URL. Existing completed payments are not refunded; only future Marketplace renewals are stopped.
- [x] Marketplace expiration/failure webhook notifications use fresh reconciliation, not unconditional expiration based on an old event. Other product handlers are unchanged.
- [x] 31 focused tests pass, including completion/expiration races, wrong ownership, uncertain network results and lost session persistence.
- [ ] Validate simultaneous signups end-to-end in Stripe test mode before rollout. Cross-service operations are not atomic: two payments completed before either activation is observed can still require manual review. No automatic refund is performed.
- [ ] Payment/invoice recovery beyond subscription synchronization and real scheduler verification remain separate release checks.

### Renewal recovery phase

- [x] Add a separate daily Marketplace renewal recovery cron (02:35 UTC), with mandatory CRON_SECRET authentication and fail-closed behavior when the secret is missing.
- [x] Select only Marketplace Stripe subscriptions; keyset pagination avoids skipping records when reconciliation changes status. Individual failures do not stop the remaining records and produce a non-success response for monitoring.
- [x] Attempt reconciliation after successful manual PRIME activation. A Stripe failure preserves the completed PRIME grant and displays a warning to the admin; the daily sweep retries it.
- [x] Keep the new cron and manual-activation integration inert while MARKETPLACE_MEMBERSHIP_ROLLOUT_READY is false. No live subscriptions changed during development.
- [x] Verify 22 focused tests, including page traversal, isolated failures and empty recovery.
- [ ] Resolve incomplete/simultaneous checkout recovery and verify real scheduler execution before activation. The daily sweep is a fallback, not a guarantee against a renewal immediately following a failed Stripe request.
- [x] Offer component checked at 320/390/768/1440px with static rendering and Playwright; no horizontal overflow. Full authenticated end-to-end scenarios still pending.

- addon_products/subscriptions/payments/trial_usage already provide product isolation and uniqueness constraints.
- Marketing checkout and activation email paths currently contain Marketing-specific logic. Do not dispatch Marketplace events through Marketing emails.
- getPrimeAccessState supplies entitlement; eligibility alone must not grant access.
- Marketplace listing currently loads via service-role queries. Hiding a menu alone cannot secure it.
- Deactivation currently models Marketing and PRIME explicitly; extend it before Marketplace sales.
- Existing financial estimates, lead view counts, purchased lead access and public notifications need explicit access review.

## Release safety

Foundation migration only inserts missing settings and a draft catalog entry. It does not change RLS, functions, wallet balances, prices of existing products, or current subscriptions.
The price examples in the discussion are not adopted as production settings: admin must configure actual prices and trial duration.
Do not enable paidAccessEnabled until all protected paths and billing tests pass.
Keep Stripe IDs and credentials out of this document. No customer emails or live payments during tests.

## Marketplace invoicing

The existing PRIME invoice generator produces FatturaPA XML in the billing archive;
reuse that flow, not merely Stripe's hosted receipt. Do not imply automatic SDI
transmission unless the existing platform workflow performs it.
Use the actual settled payment amount, not today's configured catalog price.
The invoice line is "Abbonamento Marketplace Lead Host", with the billed period.
Marketplace membership has no wallet component and must not credit the wallet.
Invoice generation failure must be visible and recoverable independently of paid access.
The Marketplace webhook persists subscription access before XML generation and returns
a retryable failure if automatic generation fails. Other products retain their existing paths.
Marketing activation messages are excluded for Marketplace checkouts.
Verification: TypeScript, targeted ESLint and 16 policy/catalog/XML/fiscal tests passed.
Live checkout, concurrent webhook delivery and authenticated responsive UI verification
remain pending before enabling Marketplace sales; no live payments used during development.
Checkout/subscription phase: 17 focused policy, catalog, checkout parameter and XML tests pass.
Checkout remains guarded by MARKETPLACE_MEMBERSHIP_ROLLOUT_READY=false and draft product.
No purchase CTA is wired yet. Incomplete checkout/deactivation races, PRIME/Marketplace
simultaneous signup reconciliation and trial/paid notification templates remain release blockers.
Checkout older than the Stripe idempotency window is looked up by customer and local
reference; an unresolved attempt fails closed instead of risking another subscription.
The new nullable payment reference and unique index do not rewrite old invoices.
Migration uses short lock/statement timeouts; if busy, retry later rather than
removing timeouts during live traffic. Paid access and checkout remain disabled.
