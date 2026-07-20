# Lead Host Architecture

Lead Host is a vertical marketplace for Italian property owners and Property Managers.

The product has one shared acquisition pipeline and three application surfaces:

- public website: homepage, owner landing, Property Manager landing, legal placeholders;
- Property Manager app: onboarding, marketplace, lead detail, purchases, unlocked contacts;
- Super Admin app: acquisition, verification, publishing, payments, reports, analytics, settings.

## Core Pipeline

```text
acquisition
-> raw source capture
-> normalization
-> duplicate check
-> qualification
-> approval
-> publication
-> sale
-> contact unlock
-> analytics
```

Meta Lead Ads and Lead Host owner forms must both write to the same normalized model. Raw source payloads are preserved separately for audit, debugging, idempotency, mapping changes, and marketing attribution.

## Stack

- Next.js App Router with TypeScript
- Tailwind CSS
- PostgreSQL on Supabase
- Supabase Auth and Row Level Security
- Stripe Checkout and Stripe webhooks
- Resend for transactional email
- Supabase Storage for optional owner photos
- Vercel for hosting

## Security Principles

- Owner contact data is stored separately from public lead data.
- Marketplace API responses never include owner contact fields unless the authenticated PM has an unlocked purchase.
- Stripe and Meta webhook secrets stay server-side.
- Every business-critical transition writes an audit log.
- Lead purchases are confirmed only after verified Stripe webhooks.
- Purchase allocation is protected by database transactions and row locks.

## Commercial Invariants

- Shared lead price: 2900 cents.
- Exclusive lead price: 5000 cents.
- Maximum shared buyers: 2.
- Exclusive purchase is allowed only when the lead has zero purchases.
- Lead availability window: 7 days from publication.
- Public unavailable state is always neutral: `Non piu disponibile`.
- Property Manager registration is free in V1.
- V1 has no mandatory subscription.

## Module Layout

- `src/app`: route surfaces
- `src/components`: shared UI components
- `src/lib/config`: application constants
- `src/lib/domain`: lead and purchase state machines
- `src/lib/supabase`: typed Supabase clients and database types
- `supabase/migrations`: SQL schema and database functions

## Phase 1 Scope

Phase 1 creates the technical foundation: project structure, design language, route skeletons, Supabase schema, auth/role primitives, environment contracts, and state-machine definitions. Payment execution, Meta synchronization, and working form submission are implemented in later phases on top of this foundation.
