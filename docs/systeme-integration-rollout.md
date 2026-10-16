# Systeme.io to private Marketing CRM

## Agreed behavior

- Each PM uses a separate Systeme.io account.
- The connection belongs to the PM and requires access to the Marketing addon.
- Import CONTACT_OPT_IN events in one direction, without synchronizing pipeline stages.
- Import all opt-ins by default; optionally accept only selected source pages.
- Ignore query parameters, including UTM parameters, when comparing source pages.
- Create new contacts in the configured CRM stage (initially Nuovo lead).
- Do not move an existing contact back to its starting stage or overwrite its working notes.
- Verify webhook signatures; never use a PM browser session as webhook authentication.
- Deduplicate delivery retries by message ID and link external contact IDs to CRM contacts.
- Provide the client with a personal URL, signing secret, setup instructions and recent outcomes.

## Rollout status

1. Completed: manual backups succeeded; user applied the foundation migration. Read-only production checks confirmed four empty tables, denied anonymous reads and the original six CRM contacts.
2. Completed: user applied the atomic import migration; the server endpoint is deployed to Preview only. A real signed CONTACT_OPT_IN was imported successfully during the pilot.
3. Completed in Preview: Integrazioni menu/page with connection setup, stage selection and recent events. Authenticated configuration, creation, enabling and pausing worked in the pilot. No new migration required for this phase.
4. Completed: dedicated server encryption key configured in Vercel Production and Preview; preview commit 59397fb passed a real Systeme.io opt-in test. Both test connections were paused and the temporary Vercel domain exception removed. Production was not redeployed.
5. Completed in protected Preview: independent per-page flows, field mapping and read-only additional CRM answers. All four migrations are applied. See docs/systeme-flows-rollout.md for test results, accepted first-origin semantics and remaining live-test limits.
6. Prepared 2026-10-16: docs/systeme-client-setup.md contains client onboarding instructions; docs/systeme-production-release.md contains the controlled release, smoke-check and rollback procedure. Production application publication and production webhook activation have not occurred.

## Baseline and manual backups

- Production repository baseline: 661f41f00e0cce4e9c0d0e59c350b8902aa92b92.
- Manual database/Storage backup: https://github.com/websolution79-beep/lead-host/actions/runs/38699206176.
- Manual repository backup: https://github.com/websolution79-beep/lead-host/actions/runs/38699210920.
- Both manual workflows completed successfully, including the external database/Storage verification.
- Read-only production CRM baseline: 2 pipelines, 18 stages, 6 contacts.

## Phase 1 migration

File: `supabase/migrations/202610150001_marketing_systeme_integration_foundation.sql`.

The migration creates four tables without inserting integrations or changing existing CRM records:

- `marketing_systeme_integrations`: owner, disabled-by-default connection, import mode, source pages and destination stage.
- `marketing_systeme_webhook_secrets`: server-only encrypted signing secrets. No browser read policy, including for superadmins.
- `marketing_systeme_contact_links`: external contact IDs linked to contacts in the same PM's private CRM.
- `marketing_systeme_webhook_events`: stable message IDs, checksums and minimal processing outcomes, without copies of full contact payloads.

Only the server can write the new tables. PMs can read their own configuration, contact links and outcomes; superadmins can read these for support. Composite foreign keys and validation triggers reject cross-PM associations even for server writes.

The transaction has a five-second lock timeout. No triggers are attached to existing application tables. No HTTP endpoint, menu entry or active integration is introduced by this migration alone.

The next phase will use a dedicated server encryption key, separate from the backup key. Secret creation, rotation and verification will be implemented and tested before the first connection can be enabled.

## Validation

Run the foundation migration and `supabase/tests/marketing_systeme_foundation.sql` on an isolated PostgreSQL test database, using a minimal CRM fixture. The test script requires the session setting `leadhost.isolated_schema_test = true` and must not be run against production.

Tests cover disabled defaults, duplicate integration/message/contact IDs, destination/contact ownership, authenticated row visibility, denied client writes, secret access, and continued CRM contact creation after the new schema is present.

Local validation on 2026-10-15 passed using an in-memory PostgreSQL instance (PGlite). The real CRM foundation and the new migration were executed in isolation; the new migration was also rerun successfully. PGlite was installed only in the temporary validation directory, without changing application dependencies or lockfiles.

## Phase 2 atomic import

Migration: `supabase/migrations/202610150002_marketing_systeme_atomic_import.sql`.

This adds only the server-executable `import_marketing_systeme_opt_in` function. It creates no connections, schedules no jobs and changes no existing application triggers. Import calls serialize on the individual integration row, register the message and write the contact/link in one transaction. Failures roll back contact and link writes together, recording a retryable result.

The future endpoint is `POST /api/webhooks/systeme/[integrationId]`. It supports the signed Settings > Webhooks service, schema version 1, CONTACT_OPT_IN. Legacy URL-only automation webhooks are not accepted by this endpoint.

- Verify HMAC SHA256 against the raw body or the documented normalized JSON representation, using constant-time comparison.
- Limit streamed bodies to 256 KiB before parsing; never log raw payloads, signing secrets or internal error details.
- Encrypt signing secrets with AES-256-GCM, binding each ciphertext to the integration UUID.
- Require a dedicated 32-byte base64 `MARKETING_INTEGRATIONS_ENCRYPTION_KEY`, kept only on the server and preserved across deployments. It was not generated or configured during phase 2; see phase 4 for configuration.
- Recheck enabled state, secret rotation, active profile and Marketing entitlement inside the database operation.
- Match external IDs only inside the integration. Match a preexisting email only inside the same PM's default pipeline and only when unambiguous.
- Preserve existing names, notes, stages and follow-ups; fill only empty imported contact fields.
- Accept missing source URLs in all-pages mode; selected-pages mode ignores missing or nonmatching source pages. URL normalization ignores query parameters, fragments and trailing slashes, preserving path case.
- Map names, email, phone, address, city, province, region and property type from standard field slugs. Unknown/custom fields are not inserted into notes. A missing name is reported without inventing customer details.
- Return 200 for recorded permanent rejections/filters, and 503 for transient import failures so Systeme.io can retry. Message ID conflicts return 409; duplicate completed deliveries are acknowledged without repeating writes.
- Do not store full contact payloads in the event log.

Setup in phase 3 must initialize the PM's default CRM using the existing CRM API before enabling the connection. If the CRM has no pipeline/stage, import fails safely with `crm_not_ready`, allowing delivery retry after setup.

Phase 2 verification: ten Node/TypeScript tests passed for encryption, documented signature normalization, field mapping, URL matching and endpoint error behavior. Isolated PostgreSQL tests passed for duplicate deliveries, private email matching, source filtering, suspended/expired access, stage/note preservation, secret rotation and rollback/recovery after a simulated failed link write. The atomic migration was also applied twice locally. Focused ESLint, TypeScript and the full Next.js production build passed. A real Systeme.io delivery remains pending the controlled pilot.

Official references:

- https://developer.systeme.io/docs/webhooks
- https://developer.systeme.io/docs/new-optin
- https://help.systeme.io/article/2930-how-to-use-systeme-ios-webhook-service

## Phase 3 connection settings

- New page: `/app/marketing/integrazioni`, using the same Marketing access guard as CRM and a matching menu entry on desktop and mobile.
- Authenticated API: `/api/marketing/integrations/systeme`. It always derives the owner from the authenticated profile and accepts no profile/integration ownership fields from the client.
- Connection creation initializes the default CRM through the existing CRM API before creating a disabled connection and its encrypted secret.
- Plaintext signing secrets are returned only once on creation/rotation, never in GET responses, storage in the browser, or audit logs.
- Save requests use the original updated_at value to detect concurrent edits; rotation uses the original secret timestamp for the same reason.
- All-pages import is the default. Page filters are normalized and deduplicated on save.
- The screen shows paused/pending/verified status and the latest 25 received event outcomes, including filtered or invalid contacts. A real imported/linked event after secret generation is required for the verified status.
- Setup and connection changes reuse existing audit logging without including signing secrets or raw contact payloads.
- A missing/invalid encryption key prevents connection creation or enabling while allowing the page to render a clear availability state.

Validation on 2026-10-15: 14 unit tests, focused ESLint and the full production build passed. An isolated UI harness reused the real component with mocked auth/API responses; setup, one-time secret display, required-page validation, normalized saving, event outcomes and rotation confirmation passed. Screenshots at 360, 390, 768 and 1440px were reviewed with no horizontal overflow. The real unauthenticated settings API returned 401. No connections or contacts were created in production during these tests.

Visual QA artifacts: `output/systeme-integration-qa/` (simulated data only). Test-only packages remain under `tmp/`; application dependencies and lockfiles were not changed.

## Phase 4 server configuration

On 2026-10-15, after the user signed in to Vercel, the project environment-variable search confirmed the encryption key was absent. A cryptographically random 32-byte base64 key was generated in memory and saved as a Secret for Production and Preview. The value was not printed, committed, or written to local environment files. Vercel confirmed both environment entries and successful creation, with a new deployment required for the change to take effect.

No other environment variables were changed and no redeploy was triggered. The live production deployment remained on baseline commit 661f41f. No integration was enabled and no CRM contacts were imported. Configuration evidence without secret values: `output/systeme-integration-qa/vercel-encryption-key-configured.jpg`.

Next: deploy an isolated preview of the new code, verify server readiness without exposing the key, then connect a designated pilot PM's separate Systeme.io account and submit one controlled opt-in. Preview and production currently share the CRM database; do not create connections or import contacts for unrelated PMs during the pilot.

Preview preparation: the webhook URL uses Vercel's trusted branch alias in Preview, falling back to the deployment hostname. Production keeps the existing canonical app origin; shared URL helpers and other integrations are unchanged. Missing or invalid preview host configuration fails closed. Four additional tests cover these cases (18 total passing); isolated database checks, focused ESLint and a fresh production build passed before publishing the preview branch `codex/systeme-crm-preview`.

Preview deployed successfully on 2026-10-15 from commit 59397fb42ca62f9a46b8fcebe525de69ce62991c:

- Deployment: https://vercel.com/websolution79-1327s-projects/lead-host/9d29jUQt29m9evurNmLN4saHfJ7C.
- Stable preview: https://lead-host-git-codex-systeme-b740c3-websolution79-1327s-projects.vercel.app/app/marketing/integrazioni.
- The page redirects an unauthenticated Lead Host visitor to login with the correct return path; the pilot login is open in the browser.
- GitHub's Vercel check reports success and Vercel shows Preview / Ready. Production remains on main baseline 661f41f.
- Eleven existing billing tests also passed. Read-only database checks still show six CRM contacts, zero integrations and zero webhook events.
- An external unauthenticated request to the preview settings API returned HTTP 302, explicitly protected by Vercel Authentication. This is an edge protection response, not an application authorization result. No external webhook smoke test or real delivery has passed yet. Do not disable protection or create bypass credentials without explicit approval.
- Next: identify and sign in as the designated Marketing-enabled pilot PM, verify the server-ready state, and resolve the preview ingress protection before a real Systeme.io delivery (or explicitly authorize a production rollout with connections initially disabled). No production publish occurred during this step.
- Deployment screenshot: `output/systeme-integration-qa/vercel-preview-ready.jpg`.

## Pilot connection creation

The user signed in as businesspronto.it@gmail.com and explicitly confirmed that account for the pilot. The authenticated Integrazioni screen loaded without a server-availability warning and enabled connection creation. After confirmation, the normal UI created integration `983bf974-667a-4367-98da-2ce18a40883c`, with a preview-branch webhook URL and a one-time signing secret.

Read-only database checks confirmed enabled=false, import_mode=all, default destination stage (null), one integration, zero events and the original six CRM contacts. The secret was not copied into this document, printed in conversation, or stored in local files. The Lead Host browser tab remains open so the user can use its one-time secret display.

The Systeme.io login page is open for the user to access the intended test account. No Systeme.io webhook was created and no synchronization enabled. Vercel preview ingress protection still needs an explicitly approved resolution before real delivery. Production remains unchanged. Screenshot limited to the connection confirmation/header, excluding secret fields: `output/systeme-integration-qa/pilot-connection-paused.jpg`.

## Completed end-to-end pilot

On 2026-10-15, the user signed in to the separate Systeme.io subaccount named Test Integrazione, then explicitly authorized the temporary preview-domain exception, configuring its Opt-In webhook, enabling the test connection, sending one test contact, and restoring the paused/protected state afterward.

- Temporarily exempted only `lead-host-git-codex-systeme-b740c3-websolution79-1327s-projects.vercel.app` from Vercel Deployment Protection. The general authentication setting stayed enabled; no automation bypass token was created.
- Verified that the exposed preview still returned application HTTP 401 for an unauthenticated settings API request and for an unsigned webhook request.
- Created the Systeme.io webhook Lead Host CRM - Test integrazione, with CONTACT_OPT_IN only, the existing personal webhook URL and signing secret. No other subaccount configuration was changed.
- Confirmed that the test funnel had no additional automation rules. Submitted a synthetic contact named Test Integrazione Lead Host through `https://test-integrazione.systeme.io/e1501841`, using a unique plus-address alias of the pilot PM's email.
- Real delivery was imported at 2026-10-15T09:42:17.93838Z. Event ID: `bb45dada-9d18-4276-ad02-05dcb57adf57`; CRM contact ID: `e7a58128-7bed-4a22-bf6e-eb6ff130529e`. Status imported, no rejection reason, correct source page. Both the Integrazioni event list and CRM Nuovo lead column displayed the new contact.
- Final database checks: original six contacts plus exactly one test contact (seven total), one external contact link, one imported event, and enabled=false for the pilot integration. The test contact is retained as identifiable test evidence; no preexisting CRM contacts were edited or deleted.
- Reopened the saved Systeme.io webhook and confirmed Attivo=false. Its edit form required the same signing secret even when only pausing; reused the secret previously observed during the authorized creation, without changing it or storing it in files.
- Removed the temporary domain exception and verified that an external request again returned HTTP 302 protected by Vercel Authentication. The remote main branch still points to baseline 661f41f00e0cce4e9c0d0e59c350b8902aa92b92.
- Cleared captured secret-bearing UI strings from the working browser session after configuration. No signing secret appears in documentation, screenshots or conversation output.

Evidence: `output/systeme-integration-qa/pilot-import-verified.jpg`, `pilot-import-complete-paused.jpg`, and `pilot-crm-contact.jpg`.

Next: controlled production deployment, smoke checks, and final client setup instructions. The test webhook must remain paused: it targets the protected preview, not production. In Systeme.io the URL of an existing webhook is disabled in the edit form; create a separate production webhook with the production URL instead of trying to reuse the preview endpoint. If the one-time signing secret is no longer available, rotate it in Lead Host while the connection is paused before configuring the new production webhook.
