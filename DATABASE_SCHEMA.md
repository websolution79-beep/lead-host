# Lead Host Database Schema

The initial schema is in `supabase/migrations/202607200001_lead_host_foundation.sql`.

## Main Tables

- `profiles`: authenticated users and shared identity fields.
- `user_roles`: application roles, including `property_manager` and `super_admin`.
- `wallets`: per-profile wallet balance.
- `wallet_transactions`: wallet top-ups, lead purchases, refunds, and adjustments.
- `property_manager_profiles`: PM business profile and verification state.
- `property_manager_services`: services offered by each PM.
- `property_manager_areas`: geographic coverage per PM service.
- `owner_requests`: normalized request lifecycle from any acquisition channel.
- `owner_contacts`: sensitive owner contact data.
- `properties`: property facts used by marketplace and matching.
- `leads`: sellable marketplace opportunity.
- `lead_sources`: original channel payloads and idempotency keys.
- `marketing_attribution`: UTM and Meta attribution.
- `meta_integrations`: connected Meta account/page configuration.
- `meta_forms`: Meta Lead Form registry.
- `meta_field_mappings`: configurable source-to-normalized field mapping.
- `purchase_attempts`: checkout attempts and short-lived allocation context.
- `lead_purchases`: completed lead purchases and contact unlocks.
- `payments`: Stripe payment records and webhook reconciliation.
- `refunds`: refund review records.
- `reports`: PM issue reports.
- `notifications`: internal/email notification queue.
- `audit_logs`: immutable business audit trail.
- `settings`: platform configuration.

## Sensitive Data Boundary

`owner_contacts` is separated from `leads` and `properties`. PM-facing marketplace reads should use views or server actions that omit this table unless a completed `lead_purchases` row exists for the PM.

## Purchase Safety

The SQL migration includes `claim_paid_lead_purchase`, a database function intended to be called from the Stripe webhook handler after payment confirmation. It locks the lead row, checks availability and commercial invariants, then inserts the purchase and updates lead counters atomically.

## Auth And Roles

The auth/roles migration creates a trigger on `auth.users` that provisions a `profiles` row, a default `property_manager` role, and an empty wallet. Super Admin access is represented by an additional `super_admin` role in `user_roles`.

## Public Lead Status Mapping

- `Disponibile`: zero purchases, purchasable.
- `Ultima disponibilita`: one shared purchase, one slot left.
- `Non piu disponibile`: sold out, exclusive, expired, cancelled, or hidden from purchase.

Internal states remain more specific for Super Admin analytics.
