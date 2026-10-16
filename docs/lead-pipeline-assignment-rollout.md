# Pipeline lead assignment

## Scope and status

Implemented on codex/lead-pipeline-assignment; the Production application has not been deployed for this feature. The user applied migration 202610160001 on 2026-10-16. Read-only REST and SQL checks confirmed the table, all three functions, enabled RLS and service-only table/function privileges. There are zero assignment records. Candidate checks returned six eligible users for the superadmin and only the actor for each ordinary staff member. No live assignment mutation was executed. SQL verification: https://supabase.com/dashboard/project/gkksbudobesjmljkkjtr/sql/0bdff9b9-d684-4f7e-8b57-57645573124f.

Before migration, a read-only GET confirmed PGRST205; do not use a successful HEAD response as schema readiness evidence (it returned 204 with no count even though the table was missing).

The new operational assignment is independent of owner_requests.first_worked_by_profile_id, qualification notes, request status, pipeline stage and team compensation claims. No existing lead is assigned automatically or backfilled from first work.

## Behavior

- Each pipeline card shows Preso in carico da below its optional internal notes, including cards without notes.
- The existing worker name is explicitly labelled Prima lavorazione, with a history icon and a visually separate position. The current assignee uses a full-width field or read-only name with the team's actual accent color. Very bright colors retain their hue with darker readable text.
- Active staff with leads/write can select only themselves or Non assegnato. A colleague's assignment is read-only. Releasing it is allowed only to its current assignee or a superadmin.
- Superadmins can assign/reassign to active authorized staff or active superadmins. Suspended/read-only roles, inactive profiles and staff requiring a password change are excluded.
- Updates are atomic and versioned. Stale cards and claim/release/claim races are rejected, never retried automatically. Admin reassignment requires the current version too.
- Snapshot refresh runs every 15 seconds while visible, on focus and after a mutation. After a mutation the normal record list is refreshed as well. This is bounded polling, not instant realtime delivery.
- The new select is outside the detail button; only the grip is draggable. Selecting a member cannot open the lead or start a drag.
- Leaving the new-lead pipeline retains assignment history; only current to_verify requests appear in the snapshot. Assignments do not block normal lead editing or publication.

## Database and access

Apply supabase/migrations/202610160001_owner_request_assignments.sql before deploying the application. It creates one new RLS-enabled service-only table, three service-only functions and an index. No existing owner request, compensation table or email setting is updated. Normal authenticated/anonymous clients cannot read/write the table or call these functions; the authenticated admin API enforces leads/read or leads/write and derives the actor from its session. The RPC independently validates actor and target permissions from current database roles.

The RPC locks the owner request and its assignment, checks status and expected revision, and commits its audit log in the same transaction. Prior Production code ignores the new table. The new app tolerates missing schema by disabling this feature only, leaving the pipeline operational. Other database failures are not mistaken for an empty assignment.

Use the SQL migration's own RLS/grant statements; do not add broad browser policies or disable RLS. Preserve the table and audit history during an application rollback.

## Verification

- node scripts/test-lead-assignments-db.mjs uses only an isolated PGlite database: rerun idempotency, self-only ownership, permission/status/password guards, stale and occupied claims, ABA protection, admin reassignment, atomic audit rollback, unchanged first work/notes/compensation sentinel, RLS and RPC privileges.
- node --experimental-vm-modules --test scripts/test-lead-assignments-api.test.mjs: 12 tests of the actual handlers, source paging beyond 1000 rows, bounded ID queries, session-derived actor, strict payload validation, missing schema and conflict/error mapping.
- npx tsx --test src/lib/admin/lead-assignment-types.test.ts: two color safety/contrast tests.
- Focused ESLint, TypeScript and isolated full Next production build passed. No fixture SQL was executed on Supabase.
- Local browser harness uses actual components/CSS with synthetic names and mocked auth/API only. Own-only choices, release, read-only colleague, conflict refresh, admin choices, missing-schema fallback and no accidental detail opening were verified. Frames at 360px and 390px had matching body widths (no page overflow) and a 48px-high field; the input was not nested in the detail button. Evidence: output/systeme-integration-qa/lead-assignment-desktop.png, lead-assignment-mobile-360.png and lead-assignment-mobile-390.png. This is synthetic responsive evidence, not a real staff session or Production browser test.

Isolated sequential conflict tests and row-lock inspection are not a real two-session Production concurrency test. Before enabling daily team use, verify a controlled test lead with two authorized staff sessions after migration/deployment; confirm first work and compensation did not change. Do not claim live concurrency validation before it happens.

## Next operation

1. Completed: additive migration applied by the user; schema, candidates and privileges verified read-only.
2. Deploy the reviewed feature to protected preview and perform an authorized test on a designated synthetic request, not a real customer's working lead.
3. Publish only after successful checks. Confirm live read-only rendering, perform the agreed controlled assignment/release test, and retain the prior Ready deployment as rollback target.
