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
2. Completed locally: user applied the atomic import migration; a read-only call against a nonexistent connection returned not_found with no side effects. Code is not deployed.
3. Completed locally: Integrazioni menu/page with connection setup, stage selection and recent events. No new migration required for this phase.
4. In progress: the dedicated server encryption key is configured as a Secret in Vercel Production and Preview. No redeployment was started. A preview deployment and controlled test with one client's Systeme.io opt-in form remain pending.
5. Pending: production deployment and client configuration instructions.

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
