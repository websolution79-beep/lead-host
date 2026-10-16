# Systeme.io - Controlled Production Release

## Decision and scope

Prepared on 2026-10-16. This document is a release procedure, NOT evidence of a completed production deployment.

The user accepted first-acquisition sourceURL routing and one CRM record per recognized contact for this initial version. Multiple properties per owner remain a separate future feature. Do not change deduplication, stage preservation or routing during release.

Release the existing flow-capable application as one version: webhook, versioned configuration API, editor, navigation and read-only CRM answers. No Stripe, billing, email, Marketplace, PRIME or general CRM behavior refactor is included.

## Verified baselines

| Item | Value |
| --- | --- |
| Remote main, fetched 2026-10-16 | 661f41f00e0cce4e9c0d0e59c350b8902aa92b92 |
| Protected preview application | 2c94c16f0751f62527bb4ca7533852178e3ebbe1 |
| Application build source checkpoint | 4198fd73923892e656e4eeba3788c50e0837983c |
| Supabase project | gkksbudobesjmljkkjtr |
| Schema | Migrations 202610150001 through 202610150004 already applied and verified |
| Pilot parent | Paused, revision 9, discovery off |
| Pilot external webhook | Paused; targets protected preview, not production |
| Second PM | Manual Marketing test access expires 2026-10-23T05:28:21.683Z |

Documentation/test-only commits after preview do not change application behavior. Read current remote refs again immediately before publishing. If main advanced, stop and review/merge its changes before constructing the release; never force-push or replace unrelated updates.

## Validation record and limits

- 54 Systeme TypeScript tests and 12 route/access-guard tests passed.
- A fresh full Next production build and TypeScript check passed on the isolated 4198fd7 source archive. All 112 static pages generated, with the new Marketing routes in the build manifest. All 11 existing billing tests passed again.
- Isolated SQL suites passed: legacy import, new configuration/import, ownership/RLS, rollback, deduplication, paused behavior and configuration conflicts.
- Real signed two-page pilot passed new-contact routing, mappings, read-only answers, repeated-contact preservation and pauses.
- Real second-PM CRM/integration lists showed no other owner's contacts, stages, flows or event history.
- Direct foreign-contact API denial was tested with synthetic identities, not by extracting/replaying a real second user's bearer token.
- Identical-message provider redelivery and a live concurrent import/config lock race were not exercised end-to-end. Isolated tests cover their contracts. Retain these as residual risks, not completed live checks.
- First-origin routing is a known provider behavior accepted by the user, not a defect fixed by this release.

## Before publication

1. Obtain explicit authorization to publish to the live site. Preparing this document does not merge main, deploy or activate integrations.
2. Recheck the production deployment and remote main baseline. Include only tracked integration files, tests and documentation. Never stage output, tmp, logs, backup files or local credentials.
3. Confirm no active imports or discovery windows are unexpectedly running. Do not silently disable a newly configured customer's connection; stop and investigate a changed baseline.
4. Confirm the dedicated MARKETING_INTEGRATIONS_ENCRYPTION_KEY exists in Production through Vercel's configuration metadata. It was configured on 2026-10-15. Do not print, export or rotate it. Keep preview authentication enabled.
5. Confirm recent repository and database/Storage backup success. Existing verified manual runs are documented in systeme-integration-rollout.md; they are not a fresh snapshot of the later test contacts and manual access. Take and verify a fresh backup if the recovery point is insufficient.
6. Run the release checks below. Do not run any fixture/test SQL on Supabase. Do not use verify-systeme-flows-backend.mjs against the configured pilot: that script asserts the original legacy/revision-0 rollout state.
7. Do not reapply migrations 001-004. No new migration or production configuration write is required for this application release.

## Local checks

```powershell
npx tsx --test src/lib/marketing/systeme/*.test.ts
node --experimental-vm-modules --test scripts/test-systeme-api.test.mjs
node scripts/test-systeme-db.mjs
npm run test:billing
```

Run a full Next production build using the same application sources. Keep output away from a running development server's .next directory. An isolated git-archive copy with the existing node_modules junction was used for the 4198fd7 checkpoint; credentials were loaded into the child environment only, not copied into the archive. Do not deploy this ignored scratch directory or include it in Git.

The isolated build emitted a multiple-lockfile workspace-root warning and the existing Node localStorage experimental warning; neither failed the build. An initial invocation using Node's --env-file flag failed during Next worker initialization. Retrying with process.loadEnvFile in the parent and spawning the build with a normal environment passed, without changing application/configuration files or the existing dev server. This was a local build invocation issue, not a production application fix.

## Publish, without activating imports

1. Push the reviewed release branch through the normal repository workflow. If a PR is created, attach it to this task.
2. Merge only the reviewed version to main, preserving concurrent changes. Never use force-push or a destructive reset.
3. Let the existing Vercel production deployment complete. Verify Ready, the intended commit and canonical domain assignment before announcing completion.
4. Keep test imports, discovery and the external test webhook paused. Do not generate secrets, create customer integrations or send owner forms merely to smoke-test publication.
5. Leave schema, encryption key, Stripe subscriptions and payment processes unchanged.

## Immediate smoke checks

Read-only network checks can confirm:

- Public home/login still load; private Marketing routes redirect unauthenticated visitors to login rather than exposing CRM data.
- Unauthenticated GET /api/marketing/integrations/systeme and GET /api/marketing/integrations/systeme/flows reject access.
- Unauthenticated GET /api/marketing/crm/systeme-fields with a synthetic contact ID rejects access.
- An unsigned empty POST to the existing pilot webhook rejects before import. Verify contact/event counts remain unchanged; do not send a valid signed test without authorization.

Authenticated browser checks must confirm:

- Marketing-entitled PM sees Integrazioni and can open its page without a server-readiness warning.
- Its configuration shows its own state only; do not create or rotate credentials as a read-only check.
- CRM, Rendita Stimata and Gestione Immobili still load, including normal contact editing controls. Do not save unrelated records.
- Non-entitled PM cannot gain access merely by using the new menu URL.
- Admin finance/PRIME/Marketplace pages remain available with an authorized admin session, without financial actions.

Compare the pilot's pause/revision/discovery, original contact fingerprints, contact/event/answer counts, and second PM's empty integration state after smoke checks. Report which authenticated checks could not be executed with available sessions; do not equate an anonymous redirect with a successful entitled-PM test.

## Separate production webhook onboarding

Application publication and connection activation are separate operations. Use docs/systeme-client-setup.md for the client procedure.

The existing test webhook targets protected preview. It must stay paused. Systeme.io did not allow changing its saved URL during the pilot; create a distinct webhook for the canonical production endpoint instead of sending real leads into preview. Avoid two simultaneously active webhooks for the same connection.

Get the actual per-PM URL from Production > Marketing > Integrazioni. Never substitute a preview URL or another PM's integration ID. The key is stored encrypted in the shared database, but the plaintext signing secret is not recoverable through GET. If it was not retained, the user must regenerate and enter it in the authorized production webhook; do not attempt to decrypt/export it from the database for onboarding.

Only after explicit authorization configure/activate one pilot production webhook and the matching parent import, submit one identifiable synthetic opt-in, verify the resulting CRM contact/answer, and agree whether to leave the production pilot running or pause it again. Do not expose preview or turn off Vercel authentication for this step.

## Rollback

If checks fail, do not keep onboarding customers. Pause affected imports through the supported versioned API/UI with fresh configuration tokens, and pause corresponding external webhooks. Do not alter unrelated integrations.

Once affected imports are safely paused, restore the known prior production deployment through Vercel's supported rollback/promotion flow, verifying its domain and readiness. This needs release authorization, and any unexpected access/security prompt needs its own confirmation. The old application has no new webhook route; rolling back while a webhook remains active can interrupt deliveries.

Preserve all four additive migrations, encrypted signing secrets, contact links, imported answers, event history and the encryption key. Do not drop tables, restore the entire database over live customer data, switch flows back to legacy, or re-enable an old importer to bypass guards. Do not generate a new key as a rollback shortcut.

If the failure is confined to one customer configuration, prefer pausing that connection and investigating rather than rolling back unrelated working services. Reconcile failed/missing deliveries explicitly from provider history before reopening; a paused/excluded event is not automatically replayed by toggling import back on.

## Acceptance for handoff

Publication is complete only after the expected production commit is Ready, smoke checks are recorded, known residual risks are disclosed, and paused test states remain confirmed. A successful application deployment does not mean every customer's Systeme.io account has been connected or historical contacts have been imported.
