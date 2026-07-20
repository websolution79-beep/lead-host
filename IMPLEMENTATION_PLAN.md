# Lead Host Implementation Plan

## Phase 1 - Foundations

- Next.js, TypeScript, Tailwind project structure.
- Brand and design system baseline.
- Public, PM, and Super Admin route skeletons.
- Supabase schema and RLS direction.
- State machines for leads and purchases.
- Environment variable contract.
- Local lint/build verification.

## Phase 1B - Authentication, Roles, Profile, Wallet

- Supabase Auth email/password login.
- Automatic profile, default PM role, and wallet creation from `auth.users`.
- Super Admin role support and protected admin shell.
- PM registration entry point.
- Editable profile, avatar upload, password update, logout.
- Wallet balance and wallet transaction history foundation.

## Phase 2 - Owner Landing And Form

- Mobile-first owner landing.
- Multi-step owner request form.
- Consent capture.
- Optional photo upload plumbing.
- Draft owner request persistence.

## Phase 3 - Acquisition Pipeline

- Normalization service.
- Duplicate detection.
- Qualification rules.
- Manual/automatic approval modes.
- Completion-token flow foundation.

## Phase 4 - Meta Lead Ads

- Meta webhook verification.
- Lead retrieval by `leadgen_id`.
- Configurable field mapping.
- Idempotent raw payload capture.
- Completion email for partial Meta leads.

## Phase 5 - Property Manager Onboarding

- Free registration.
- PM profile.
- Services and geographic coverage.
- Verification/suspension states.

## Phase 6 - Marketplace And Matching

- Anonymous lead cards.
- Lead detail without private contacts.
- Filters and compatible recommendations.
- Matching rules for local, remote, and hybrid services.

## Phase 7 - Stripe Purchases

- Shared and exclusive checkout creation.
- Stripe webhook confirmation.
- Transactional purchase allocation.
- Race-condition tests.

## Phase 8 - My Leads

- Purchased lead list.
- Secure contact unlock.
- Click-to-call and click-to-email.
- Purchase history persistence.

## Phase 9 - Super Admin

- Acquisition queues.
- Lead approval and publishing.
- PM management.
- Payments, refunds, reports, notifications, settings.

## Phase 10 - Notifications, Reports, Refunds

- Internal notifications.
- Transactional email.
- PM problem reports.
- Manual refund workflow.

## Phase 11 - Analytics

- Acquisition and revenue dashboards.
- Campaign attribution.
- Lead sale performance.
- Future ad spend import hooks.

## Phase 12 - Release

- Security review.
- Responsive QA.
- Seed/demo data.
- GitHub setup.
- Vercel deployment.
