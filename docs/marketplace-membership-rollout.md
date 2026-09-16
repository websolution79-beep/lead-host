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
- [ ] Open Stripe dashboard for user login before creating Marketplace Lead Host product.
- [ ] Implement price snapshots, checkout reuse, trial eligibility and terms acceptance.
- [ ] Implement webhook reconciliation, payment history and recovery of out-of-order events.
- [ ] Add offer page and server-side restrictions for lists, details, purchase APIs and database purchase functions/RLS.
- [ ] Add profile management and cancellation; account deactivation blocker.
- [ ] Add idempotent PRIME-triggered cancellation and retry/reconciliation (including simultaneous checkouts).
- [ ] Add Marketplace payments/admin subscribers, analytics, billing and email templates.
- [ ] Verify desktop/mobile and integration scenarios before enabling checkout or paid access.

## Integration findings

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
