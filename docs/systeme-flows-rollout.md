# Systeme.io flows and field mapping

## Status

1. Completed: additive schema, compatibility plan and isolated database tests. Migration 202610150003 was applied through the production project's Supabase SQL Editor after explicit user authorization on 2026-10-15.
2. Completed: read-only SQL/API checks confirmed five RLS-protected tables, unchanged legacy/paused connection, one initial paused flow, empty mapping/discovery/extra/context tables and unchanged CRM contact/event counts.
3. Backend completed and isolated-tested. Migration 202610150004 was applied and verified in production on 2026-10-15; read-only snapshot/catalog RPCs also passed real API checks. Combined application backend/UI deployed ONLY to protected preview at 2c94c16; production application is unchanged.
4. Completed: flow editor, duplication, field discovery/mapping and CRM additional answers view, with local responsive/browser verification.
5. In progress: real configuration/two-tab stale saves, signed Milan/Rome imports, distinct mappings/additional answers, repeat opt-in identity/preservation, paused routing and bounded discovery passed. See the first-origin provider limitation below. Final authenticated CRM answer rendering, second-PM API checks and real import/config transaction concurrency remain unverified. Parent import is paused and discovery is off.
6. Pending: production deployment and client instructions. Do not publish before these additions are tested.

Existing production code remains at 661f41f. Preview 2c94c16 now includes the independent flow editor/backend; earlier preview 59397fb passed the basic Systeme.io pilot. The Lead Host connection and Systeme.io webhook are paused, and Vercel protection is restored. The database now contains nine private CRM contacts: the seven prior rows remain unchanged and two new identifiable TEST FLOWS contacts are retained as evidence.

## User-facing behavior

- One signed technical webhook per PM's separate Systeme.io account; many independent flows inside that connection.
- Each flow has a name, enabled/paused state, one or more landing pages (or the optional all-other-pages fallback), a destination CRM stage and its own field mappings.
- Selected-page flows precede the optional fallback. A selected page stays reserved even while its flow is paused: it must not silently enter the fallback.
- Only one flow can claim any normalized page in a connection, and only one fallback can exist. The same URL in a different PM's separate connection is independent.
- Match complete normalized URLs, preserving path case while ignoring query parameters, fragments and trailing slashes through the existing structured URL parser. Do not use substring, partial-city, wildcard or UTM matching.
- A selected-page flow requires a known matching source page. Missing source pages may use an explicitly enabled all-pages fallback only when no specific page can be identified.
- New contacts enter the configured stage, or the default pipeline's first stage. Existing contacts keep the stage, name, notes and follow-up work already set by the PM.
- Duplication creates a paused draft in the editor. Before saving, the PM must change overlapping pages and provide a distinct flow name; never silently activate a duplicate.

## Field mapping

- Use stable source slugs received in the signed webhook, not just translated display labels. Store mappings independently per flow; never share one PM's mappings with another.
- Suggest current standard aliases as initial defaults. Allow explicit mapping of full name or first/last name, email, phone, address, city, province, region, property type, bedrooms, bathrooms, surface, property condition, requested services, timing and description.
- Full-name versus first/last-name mappings require an explicit precedence/validation rule in the editor and parser. Email and final contact name must be validated after mapping, not before discovery.
- Permit one source per built-in destination; support many ignored sources and many distinctly labelled additional answers. Do not allow mapping into profile IDs, roles, wallet values, CRM stage IDs or operational notes.
- Optional missing or incompatible values must not discard an otherwise valid contact. Validate lengths, numeric ranges and list formats; retain a bounded field/code warning without copying submitted values into the event log.
- Explicitly mapped additional answers go into separate contact fields, not the PM's notes. Their keys should include the originating flow and source slug so differently named questions cannot overwrite each other across flows.
- Repeated opt-ins fill only empty existing CRM fields. Preserve existing additional answers unless the PM explicitly edits them; do not replace manual work automatically.
- Unknown fields are ignored until configured and shown as unmapped metadata when discovery is explicitly enabled. Do not create an arbitrary global custom-field builder in this phase.

## Discovery and privacy

- The PM explicitly requests a bounded field-discovery window, then submits a test opt-in. Verify HMAC, active profile and Marketing entitlement before collecting metadata, including during a paused connection's discovery window.
- Store source page, source slug, optional field label and observation timestamps only. No sample contact values, payload copies or secrets are persisted for discovery.
- Show known fields for the relevant landing in the mapping editor. Optional example values are out of scope; metadata is sufficient to configure associations.
- A future discovery endpoint must cap the window, metadata volume and field/page counts. Default discovery_expires_at is null; this migration starts no collection.

## Additive schema

Migration: supabase/migrations/202610150003_marketing_systeme_flows_foundation.sql.

- Add routing_mode (default legacy) and optional discovery expiry to the integration configuration table only.
- New marketing_systeme_flows: per-flow routing settings. A connection-row lock serializes flow validation and rejects overlapping pages even when paused. One fallback per connection.
- New marketing_systeme_field_bindings: per-flow source/target associations, with allowlisted CRM destinations and additional-answer labels.
- New marketing_systeme_discovered_fields: value-free field metadata, isolated per connection and page.
- New marketing_systeme_contact_fields: explicitly mapped extra answers, owned by the same PM as the CRM contact. Deleting a flow preserves the answers and its name; deleting the contact removes its extra answers.
- New marketing_systeme_event_context: chosen flow and bounded warning codes for future event history. Deleting a flow preserves the event's flow-name snapshot. No raw field values are accepted in warning objects.
- All five tables have owner/superadmin read RLS; browser writes and anonymous reads are denied. Only the service role writes. Cross-PM stages, contacts, events and flows are rejected.
- Backfill an initial flow matching each existing legacy connection's page/stage/enabled settings, without changing that connection's mode or enablement. Rerunning does not duplicate flows or resurrect deliberately empty flows-mode connections.
- No CRM table alterations, no replacement of the importer, no existing contact edits, no secret rotation, no jobs and no activation are included.

## Import/API implementation constraints

- Preserve legacy processing while routing_mode=legacy. Switch to flows only after a valid configuration is saved through the new API; old preview clients must not silently overwrite or enable a flows-mode connection.
- Manage flow, mapping and connection changes in one server-side transaction, with parent-connection locking and optimistic concurrency checks. Import processing must use a consistent configuration snapshot and reject/retry stale mapping snapshots.
- Preserve the existing integration/message-id deduplication and external-contact association across flows. Do not key contact identity by flow: one PM's repeated contact must not become a duplicate just because a second landing was used.
- Parent connection pause overrides all flow states. A matched paused specific flow is acknowledged as ignored, not rerouted to the fallback. An unmatched page is ignored when no enabled fallback exists.
- Schema preparation does not implement routing, field discovery or mapping in the old endpoint. Do not label these capabilities operational before the engine and UI phases are deployed.

## Local verification

Run ONLY in an isolated database using the existing minimal CRM/access fixtures, both previous migrations, the legacy-flow fixture, this migration twice, and supabase/tests/marketing_systeme_flows_foundation.sql. Each fixture/test requires leadhost.isolated_schema_test=true.

Validation on 2026-10-15 passed in PGlite: backfill/rerun idempotency, unchanged importer source/configuration/contact notes/secrets, paused defaults, source-page conflicts, canonical URL input, target-stage ownership, allowlisted/unique field bindings, additional-answer labels, discovery metadata privacy, event-warning validation, cross-PM ownership, service-role writes, authenticated RLS, denied anonymous reads/browser writes, and retained answers/history after flow deletion. The real legacy importer still imported a synthetic isolated contact into its original destination after the extension.

The original atomic-import and ownership tests also passed, followed by all 18 existing TypeScript integration tests. PGlite remains in tmp; no application dependencies were changed. Initial local preparation performed no production writes or deployments. The later, explicitly authorized production application is recorded below.

## Authorized production application

On 2026-10-15 the user reported applying the migration. Read-only API checks found no routing_mode column or new tables. After the user signed in to Supabase and explicitly requested autonomous migration execution if needed, a read-only SQL preflight in project gkksbudobesjmljkkjtr / main PRODUCTION confirmed the schema was still absent, with seven contacts, one webhook event and zero enabled connections.

The complete, previously tested migration file was inserted into the SQL Editor and read back through the editor's normal copy action. Its text matched the local source after CRLF normalization before execution. The agent ran the original transaction using Run without RLS: the script itself enables RLS and installs grants/policies. Supabase returned Success. No rows returned. No fixtures, test scripts or other migrations were executed in production.

Read-only SQL verification returned:

- New tables: 5/5; RLS enabled: 5/5; owner-read policies: 5/5.
- Anonymous SELECT denied: 5/5; authenticated INSERT/UPDATE/DELETE denied: 5/5.
- Pilot connection routing_mode=legacy, enabled=false, discovery_expires_at=null.
- Exactly one Flusso iniziale, disabled, all-pages mode and default destination, faithfully matching the prior pilot settings.
- Zero rows in field bindings, discovered fields, contact extra fields and event context.
- Seven existing CRM contacts and one prior webhook event, unchanged counts.
- Separate real API checks confirmed anonymous requests to all five tables returned HTTP 401.

No import was activated, no signing secret was changed and no application deployment occurred. The reason the earlier user-run attempt did not apply remains unconfirmed; do not infer a specific cause.

Evidence: output/systeme-integration-qa/flows-migration-applied.jpg and flows-migration-verified.jpg. The SQL Editor verification remains available at https://supabase.com/dashboard/project/gkksbudobesjmljkkjtr/sql/7fc64322-aa92-466e-a17a-42e35ab40118 (the editor now contains the read-only verification query).

## Next handoff

Migrations 202610150003 and 202610150004 are applied and verified; do not ask the user to run them again. Next build the flow editor/additional-fields UI and deploy the combined application code to the protected preview. Then run the multi-flow tests before production publication. Do not run fixtures/tests against production or enable the pilot implicitly. The older preview is not flow-aware: keep the pilot in legacy/paused mode until the combined preview is deployed.

## Local routing/mapping core - 2026-10-15

Added three independent files without modifying existing endpoints, the legacy parser/importer, the database or the deployed application:

- src/lib/marketing/systeme/flows.ts: version-2 strict configuration contract, max 20 flows / 50 pages per flow / 200 bindings per flow, URL normalization, unique IDs/names/pages/fallback, allowlisted destinations and required name/email mappings before enabling a flow. A paused specific flow reserves its pages. Full-name mapping is mutually exclusive with first/last-name mapping; both separate name parts may be combined.
- src/lib/marketing/systeme/flow-payload.ts: bounded envelope parsing before name/email mapping, value-free discovery metadata, standard-alias suggestions, explicit per-flow mapping, optional-field warnings, additional-answer keys scoped by flow/source, and deterministic import planning. Suggestions never silently import unknown fields; the saved mapping is authoritative. The canonical top-level Systeme.io email takes precedence over a custom same-slug field, while a different explicitly mapped source can be used instead.
- src/lib/marketing/systeme/flows.test.ts: 22 new tests for configuration, Milan/Rome routing, paused/fallback behavior, per-flow custom fields, required-field diagnostics, integer bounds, text/list limits, metadata privacy, warning bounds and unchanged legacy parsing.

Validation: all 40 Systeme.io TypeScript tests passed; targeted ESLint passed; full npm run build passed; all existing isolated PGlite ownership/RLS/atomic-import/flow-foundation regression tests passed. Build emitted existing Node localStorage experimental warnings; tests emitted a Node module.register deprecation warning; neither caused a failure.

These modules are deliberately not wired into the active handler. They have no network/database writes, do not activate discovery and do not replace access/signature checks. Only call planning/mapping with the validated configuration loaded for that PM. The future atomic RPC must still enforce current ownership, entitlement, connection/flow state and configuration version under a parent-row lock. It must preserve CRM stage/name/notes/follow-up and nonempty fields/additional answers on repeat opt-ins, and commit contact/link/answers/event context together. Those persistence/concurrency guarantees have not been implemented or tested by this pure-core step.

No migration or deployment is required for this step. Production and the paused pilot remain unchanged. The immediate next operation is the atomic configuration/import backend, followed by the flow/mapping editor and real preview tests.

## Local atomic backend - 2026-10-15

This later step supersedes the pure-core handoff above. Application changes remain local; no preview/production deployment, SQL Editor execution, secret rotation or activation was performed.

Migration: supabase/migrations/202610150004_marketing_systeme_flows_backend.sql. It adds configuration_revision (default 0) to the connection, server-only functions and a narrow legacy-settings guard. It does not enable connections, switch routing modes, collect metadata or import contacts on application.

### Versioned configuration

- GET/PATCH /api/marketing/integrations/systeme/flows derives the owner from requireMarketingAddonAccess, never from a request-body profile ID. Responses are no-store. GET returns an atomic snapshot plus a separate bounded catalog of field metadata, not submitted values or secrets.
- PATCH accepts version=2, configurationToken and one explicit command: save_flow, delete_flow, set_enabled, start_discovery or stop_discovery. Save one flow and all its bindings in one transaction. The editor should submit independent flow edits, not a full-list replacement: overlapping-page reassignment must first release the page from its prior flow.
- The configuration token fingerprints connection revision/settings plus ordered flows/bindings; it catches both an API save and a direct mapping edit. Configuration and import lock the same parent connection. Stale saves return HTTP 409; stale import plans return a retryable 503 without event/contact writes.
- Additional triggers take the same parent lock for direct mapping inserts/updates/deletes and flow deletes. This prevents a direct service-side binding change from racing between snapshot validation and persistence; ordinary API operations acquire the parent lock first.
- First save_flow switches that connection to flows mode but pauses the parent and any other legacy backfilled flows. Starting imports requires a separate set_enabled action with a valid secret, mapped enabled flow and usable CRM. Deleting/pausing the last enabled flow also pauses the parent.
- Legacy PATCH now filters routing_mode=legacy. A database trigger also rejects old deployed clients that try to mutate enablement/legacy routing fields on a flows-mode connection. The versioned RPC uses a transaction-local guard and restores it after each operation.

### Atomic import

- The old importer body is preserved intact under import_marketing_systeme_opt_in_legacy. Its existing public RPC name becomes a service-only wrapper that behaves as before for legacy connections and fails closed/retryably for flows connections. Do not rerun migration 002 over this wrapper.
- The TypeScript service retains the original RPC for legacy connections and uses the new snapshot/mapping/flow RPC only after an explicit mode switch. It does not require the new snapshot function for a still-legacy connection. A mode change during processing is rechecked inside the RPC.
- The flow RPC rechecks secret rotation, current configuration token, active profile/Marketing access, source-page routing, parent/flow pause and private destination stage. It selects the flow itself instead of trusting the mapped flow ID. It keeps the existing integration/message-id and integration/external-contact identity across flows.
- Contact, link, extra answers, discovery updates and event context commit together inside a nested transaction. A late failure rolls them back and leaves only a retryable import_failed event. Repeating that message after recovery imports once. Ordinary duplicate delivery does not write a second contact.
- Existing name, stage, notes, follow-up, nonempty fields and prior extra answers are preserved. Null fields may be filled; zero rooms/bathrooms is a valid existing value, not an empty field. Operational keys such as notes/stage/profile are also rejected by persistence.
- The signed handler now exposes a separately parsed envelope to the dispatcher after HMAC verification. A legacy missing-name result does not block a valid custom name mapping in flows mode. Unsupported protocol/schema events cannot import or discover fields.
- Optional long answers are truncated with a value-free warning, not rejected at envelope parsing. NUL/unpaired-surrogate characters in mapped optional text are removed with invalid_value warnings so PostgreSQL text encoding cannot discard an otherwise valid lead. Invalid source/configuration identifiers are rejected instead. All body/field-count/list/numeric limits still apply.

### Bounded discovery

- Explicit discovery windows default to 15 minutes and are limited to 1-30 minutes; stopping or expiry disables collection. Paused imports may collect metadata during that explicit window, but suspended owners, expired Marketing access and unsupported schemas cannot.
- Store only normalized source URL, slug, optional label and first/last observation time. Reject metadata objects containing additional keys/values. Per connection: at most 1,000 stored fields and 50 distinct source pages. Quota exhaustion skips metadata additions without breaking webhook acknowledgement.
- All new functions deny anon/authenticated execution and allow service_role only. Existing owner/superadmin table-read RLS from migration 003 is unchanged.

### Validation and rollout order

- 48 Systeme.io TypeScript tests passed, including signed-request dispatch, legacy/custom-name separation, protocol rejection, paused discovery, strict commands and optional text handling.
- node scripts/test-systeme-db.mjs passed: migrations applied twice, existing ownership/RLS tests, flow-foundation tests, atomic configuration rollback, stale configuration rejection, route recheck, Milan/Rome stages, cross-flow identity, late-write rollback/recovery, extra-answer preservation, parent/specific pauses, fallback, discovery expiry/quotas and cross-PM restrictions. A fresh second PGlite database ran the COMPLETE original importer suite after migration 004, also passing.
- Targeted ESLint, TypeScript checks, npm run build and all 11 billing tests passed. Existing Node module.register/localStorage warnings remain non-fatal. The maintained SQL runner uses the already installed temporary PGlite package under tmp/systeme-db-validation; root dependencies were not changed. PGLITE_MODULE can point to another local installation. Never run fixture/test SQL on Supabase production.
- Remaining real-world checks: Supabase/PostgREST execution of the new RPCs, two-session configuration/import concurrency, authenticated API behavior in the protected preview and real Systeme.io multi-flow submissions. Isolated PGlite tests are not proof of production concurrency or complete end-to-end operation.

Next application must preflight that production is still at migration 003, the pilot remains legacy/paused with discovery off, and the existing importer matches the expected version. Apply ONLY migration 004 as one transaction with its short lock/statement timeouts; it manages its own permissions and requires no new RLS setup. Read back revision=0, unchanged connection/flow/contact/event counts, service-only function grants, original legacy body and wrapper/guard definitions. Do not open a discovery window or switch the connection into flows while the old preview is still deployed: its webhook cannot process flows and will intentionally return retryable errors.

After that, implement the editor/CRM extra-answer view and deploy the combined code to the protected preview. Keep production application at 661f41f until preview tests pass. For an application rollback, preserve the schema/guards and pause affected webhooks while restoring the flow-capable preview; do not silently switch flows connections back to legacy and bypass their page/stage mappings.

## Authorized backend migration application - 2026-10-15

After the user explicitly approved this rollout step, the agent used the authenticated Supabase SQL Editor in project gkksbudobesjmljkkjtr, main PRODUCTION. No application deployment or connection activation was included.

Read-only preflight (docs/sql/systeme-flows-backend-preflight.sql) confirmed migration 004 was absent: zero configuration_revision columns and zero new backend functions. There was one connection in legacy/paused mode, discovery off, one paused flow, seven CRM contacts, one webhook event and zero bindings/discovery/extra-answer/context rows. The existing importer source, normalized for CRLF, matched the expected migration-002 body: e5971c951e9e9e294bf97ebfb30d811d. Five JSONB data fingerprints were captured without exposing contact contents or encrypted secrets.

The agent copied the complete migration file into Monaco and copied it back via the editor's normal selection/clipboard actions. The pasted 30,703-character text matched the local file after CRLF normalization and retained BEGIN/COMMIT plus the existing lock/statement timeouts. Supabase's destructive-operation warning referred to replacing trigger/function definitions, not deleting application rows. The agent confirmed Run query; Supabase returned Success. No rows returned. No fixture/test/configuration/import function was run against production.

Read-only postflight (docs/sql/systeme-flows-backend-verification.sql) returned:

- Backend functions: 9/9, including the preserved legacy helper and guarded original RPC.
- Anonymous execution denied: 9/9; authenticated/browser execution denied: 9/9; service_role execution allowed: 9/9.
- Extension tables: RLS enabled 5/5; anonymous SELECT denied 5/5; authenticated INSERT/UPDATE/DELETE denied 5/5.
- Three guard/parent-lock triggers enabled; initial connection revision 0.
- Legacy helper source hash exactly matches the original importer before application.
- Connection remains legacy and paused; discovery remains off; initial flow remains paused.
- Seven CRM contacts, one webhook event and zero extension data rows remain.
- All five pre/post fingerprints match: contacts d7bab20f12e983a7813a7c6b1064af70; connection (excluding the newly added default revision) 6eb8a1bcac1c4aaea326fd4709c3f91e; flows 547e6da112a8a21e5be1199d1af1f345; events 04087459c8e7f1a7e70ab95072f13724; encrypted secrets 4e939142f64453645a683b1ad306c17d. These hashes are evidence of unchanged rows, not backups.

Independent PostgREST checks using scripts/verify-systeme-flows-backend.mjs confirmed the service-role snapshot and metadata catalog are available, the snapshot has revision "0" and one paused legacy flow, and the catalog is empty. Anonymous calls to both read-only RPCs returned HTTP 401 / PostgreSQL 42501. This script is a one-time initial-rollout assertion, not a health monitor to run after customers configure their flows. It uses local environment credentials only in memory and prints no credentials/contact values. No mutating RPC was called to test permissions.

The SQL Editor now contains the saved READ-ONLY postflight query, not the migration, at https://supabase.com/dashboard/project/gkksbudobesjmljkkjtr/sql/7fc64322-aa92-466e-a17a-42e35ab40118. Evidence: output/systeme-integration-qa/backend-preflight.jpg, backend-migration-applied.jpg, backend-fingerprints-verified.jpg and backend-migration-verified.jpg.

Isolated tests and both rollout queries were rerun successfully using node scripts/test-systeme-db.mjs before production application. Production application code, preview deployment/protection, signing/encryption secrets and the external Systeme.io webhook were not changed. Do not execute migration 004 again merely because the application editor is not yet visible. Next implement the UI and CRM additional-answer view, then deploy only the protected preview and perform real multi-flow/concurrency tests before enabling anything on the main site.

## Local flow editor and CRM answer view - 2026-10-15

Completed the local UI step. No new migration, production API write, signing-secret rotation, connection activation or application deployment was performed. The production application and the older protected preview remain unchanged. Do not repeat migrations 001-004.

### Implemented

- Replaced the legacy single-flow settings form with an independent flow list/editor. Keep credential creation/copy/rotation and receipt history. Webhook credentials are in a collapsible section, automatically opened when a newly generated one-time secret must be copied.
- Each flow has a name, enabled state, selected pages or one fallback, a private CRM destination stage, and field associations. Allow multiple flows for Milan/Rome with independent mappings. Show every configured source URL. Paused specific flows still reserve their pages.
- Add/edit/duplicate/pause/delete actions use the existing version-2 atomic configuration API. Duplicates are paused drafts; duplicate pages and fallback conflicts must be resolved before saving. Activation is a separate confirmed action. Saving the first legacy configuration explicitly confirms conversion and leaves the connection paused.
- The editor preserves a captured configuration token. HTTP 409 keeps the unsaved draft visible and blocks saving until the user explicitly reloads; discarding a dirty draft requires confirmation. Updating discovered metadata never silently rebases a draft token or overwrites its manual mappings. Double mutation requests are locked out.
- Per-flow source suggestions respect page filters. Unknown fields default to not imported. They can be mapped manually to an allowlisted CRM field or a named additional answer. Discovery start/stop is explicit and limited to a 15-minute window in this UI.
- Added an owner-checked, Marketing-entitlement-protected GET /api/marketing/crm/systeme-fields endpoint. It validates contact ownership before reading answers, filters both contact and profile, returns no-store responses, and paginates 100 records at a time. No write operation is exposed.
- Existing-contact CRM dialogs now display a separate read-only additional-answer section, including retained flow names/labels. It does not alter CRM notes or the contact save payload. No answers means no visible section; loading, retry, progressive load and literal-text rendering are supported.
- Native dialogs provide Escape handling, dirty-close confirmation and scrollable content with reachable save/cancel controls. Nested confirmations retain the page scroll lock until the final dialog closes. No global CSS, new package dependency or unrelated page styling was changed.

### Verification

- 53 Systeme.io TypeScript tests passed (including five new pure editor tests for page-specific metadata, preserved manual associations, bounded suggestions, independent paused duplication and conflicting configurations).
- The isolated PGlite database suite passed again, including the complete original importer tests after migration 004. No fixture/test SQL ran on Supabase.
- All 11 billing tests passed. The full production build, including TypeScript, passed. Targeted ESLint had zero errors and one pre-existing no-img-element warning in marketing-crm-board.tsx. Existing Node module.register/localStorage warnings remained non-fatal.
- Interactive browser checks used actual UI components with synthetic local API/auth fixtures. They did not exercise production credentials, PostgREST writes or a live webhook. Verified separate Milan/Rome destination stages, normalized page saving, duplicate-page rejection without writes, added/discovered mapping preservation, stale-save conflict with retained draft, explicit reload/discard, activation confirmation, pause, discovery start/stop, legacy conversion remaining paused and delete cancellation.
- Verified read-only CRM answers with progressive loading, long strings and literal HTML text (no executable script elements). Mobile answers had scrollWidth equal to the 360px inner viewport.
- Responsive browser checks used real inner iframe viewports at 360/390/768/1024px because the browser viewport override did not change the connected tab dimensions. In every tested width the page had no horizontal overflow; dialogs remained inside the viewport with scrollWidth equal to clientWidth. Also inspected the normal 1280px desktop view. Removed the dialog's extra scrollbar and prevented background scrolling. Tested Escape with dirty-draft confirmation and no unintended saves.
- Evidence (local synthetic data only): output/systeme-integration-qa/flows-desktop-local.png and flow-editor-mobile.png. The isolated fixture is under ignored/untracked tmp, not application routes or deployable code. Browser instrumentation emitted intermittent MutationObserver errors during iframe navigation; the fixture application does not instantiate that observer. Do not describe this as a verified clean production browser console.

### Next operation

Deploy the combined flow-capable backend/UI code only to the protected preview, retaining deployment protection and keeping the main-site code unchanged. Then verify authenticated APIs, two-session stale configuration/import behavior, cross-PM denial, discovery and real signed Systeme.io submissions for two test pages and two private CRM stages. Confirm existing contact notes/stage/history and duplicate handling remain intact. Do not activate the real pilot or publish production until these preview checks pass. Current local fixtures are not proof of end-to-end integration readiness.

## Protected preview deployed and test configuration prepared - 2026-10-15

Pushed only codex/systeme-crm-preview to 2c94c16f0751f62527bb4ca7533852178e3ebbe1. Vercel deployment BE31TtmwJcEMRhPUjEsx5JHZPTBU reached Preview / Ready in 1m19s. The stable alias is unchanged. Remote main remains 661f41f00e0cce4e9c0d0e59c350b8902aa92b92; no production deployment or environment-variable change occurred.

Before configuration, the read-only rollout script confirmed revision 0, one paused legacy flow, no discovery metadata and denied anonymous read-RPC execution. The authenticated preview loaded the new flow list/editor and all existing private CRM stages. An unauthenticated external request to the new flow API returned HTTP 302 to Vercel Authentication, confirming the edge protection was retained.

The user then explicitly authorized a temporary exception for the single preview domain, two test landing/flow configurations and synthetic opt-ins into the previously designated pilot CRM, followed by restoring protection and paused states. This authorization was received, but NO exception or webhook activation has yet been applied: the Systeme.io edit form requires reentering the signing secret even when re-enabling the existing webhook. The stored secret is not displayed by Lead Host; no credential was extracted, regenerated, transmitted or changed. Asked the user to reenter the existing secret directly into Systeme.io and save while keeping Attivo off, or report that it was not retained. Do not ask the user to paste it in chat.

Prepared through normal authenticated UI, only for businesspronto.it@gmail.com / Systeme.io Test Integrazione:

- Added CRM stages TEST - Lead Milano (9d4bac0f-c60c-446f-a47f-37fd740a1cc8) and TEST - Lead Roma (42ebc9ed-650a-4569-888f-067f2dd520ab). Existing stages and contacts were not edited.
- Saved the former initial flow as TEST - Proprietari Milano, with source https://test-integrazione.systeme.io/e1501841 and the Milano test stage. Confirmed first-save conversion to flows mode leaves the parent paused.
- Duplicated the existing test opt-in step in Systeme.io without changing its original page content. Copy URL: https://test-integrazione.systeme.io/e1501841-6ab00d65; page editor /dashboard/page/45772646/edit; renamed copy TEST - Landing Roma (modulo). The copy follows the original opt-in in the test funnel. No submissions were made.
- Before finding the existing step's hover-revealed duplicate menu, also created an empty step named TEST - Landing Roma. It remains an unconfigured draft without a chosen template; it is not the flow's source. It was not deleted because no irreversible cleanup was authorized. Keep it distinguishable from the functional copied step during follow-up.
- Saved TEST - Proprietari Roma with the copied URL and Roma test stage. Both flows have nine initial explicit standard bindings. Custom schema/discovery has not yet been exercised against a real delivery.
- Opened a draft of Roma in a second preview tab, then paused Roma from the first tab. Submitting the stale draft returned the real configuration-conflict error, disabled saving and preserved TEST - Roma bozza obsoleta in the editor. Explicit reload/discard removed that draft without overwriting the saved flow. This checks optimistic concurrency between two tabs sharing one authenticated account, NOT concurrent import/config database transactions or cross-PM authorization.

Final read-only database snapshot: routingMode=flows, parent enabled=false, discoveryExpiresAt=null, configurationRevision="3", two flows (Milano enabled/ready, Roma paused), seven CRM contacts globally and one webhook event globally. No new contacts, answers or deliveries were created. The external Systeme.io modal showed Attivo=false and CONTACT_OPT_IN only. Vercel Authentication is still enabled; no temporary exception needs removing at this checkpoint.

Evidence: output/systeme-integration-qa/flows-preview-deployment-ready.png, flows-protected-preview.png, flows-real-stale-conflict.png and flows-real-two-flows-paused.png. The last file shows actual preview data, not local fixtures.

Next: after the user's secret-entry handoff, finish configuring distinct form fields and verify both test pages have no outbound automations. Reconfirm the time-limited preview exception with the user at action time if this work resumes in a later turn; then expose only the preview alias, verify application auth/signature denials, activate the test import/webhook, run the signed delivery/discovery/routing/dedup/CRM preservation checks, and restore pause/protection. If the user did not retain the secret, let the user perform credential regeneration/update directly rather than changing authentication credentials on their behalf. Do not publish production or label the multi-flow integration end-to-end verified yet.

## Credential handoff and pending signed-delivery test - 2026-10-15

The user reported regenerating/updating the lost signing secret manually. A read-only query of marketing_systeme_webhook_secrets.rotated_at (without reading encrypted_secret) confirmed 2026-10-15T18:14:14.986Z. The agent did not generate or change credentials. The Systeme.io webhook is still paused, with CONTACT_OPT_IN only. Parent import remains paused, routingMode=flows, revision=3, discovery off.

The user reconfirmed the temporary exception for the one preview alias in the current operation. No exception was actually saved: Systeme.io clears the secret field after saving, and reopening its editor again shows it empty even for a state-only change. Asked the user to reenter the SAME existing secret directly into the open modal, leave it unsaved, and acknowledge. It may then be used only for activating and re-pausing that same authorized webhook, never printed or stored in files. The agent has not read, copied or transmitted its value. Avoid repeatedly asking the same security confirmation during this unchanged operation; confirm again only if its scope, destination, risk or other material circumstances change. This supersedes the earlier blanket request to re-confirm merely because a new turn starts.

Additional preparation/checks:

- The copied Roma step's Automation rules tab reported no rules. The Milano step had previously passed that check; recheck it before submission.
- In the copied page editor /dashboard/page/45772646/edit, duplicated the existing name element and configured distinct City and District input types with placeholders Citta immobile and Zona preferita, keeping separate Nome and Email inputs. These are changes to a synthetic test page only.
- The public copied page still displays only first_name/email, including when opened with campaign parameters. Do NOT claim the added fields are published. Save attempts showed a native accessibility warning: "Per favore, non chiudere la finestra del browser per evitare la perdita di dati. Contattaci o prova a salvare in seguito." Exiting also showed the save-before-exit confirmation. Retrying its Si action and a direct native Save left the editor open, with the added fields still in the draft. No browser JS dialog, reported console error or credential issue was used to diagnose a specific cause. Do not infer that Systeme.io is down globally or that Lead Host is responsible. Keep this editor tab open to preserve the draft; a user-assisted save may be needed.
- The editor's DOM snapshot omitted those warning/confirmation containers, but getAXState exposed them. Browser-tab native AX click worked (not an external/native-app automation tool). A direct Save temporarily disabled then reenabled the button; the public page still had its original two inputs.
- Created only an untracked read-only helper tmp/systeme-ui-validation/verify-flows-live.mjs and generated SHA-256 fingerprints for all seven existing contact rows in flows-live-baseline.json. Baseline was captured before any new test import. Subsequent check reported all original fingerprints unchanged, seven contacts, one old webhook event, no discovery fields and no new synthetic contacts. Never overwrite this baseline or commit its generated data.
- Live read-only snapshot/catalog RPCs with a mismatched synthetic profile UUID returned null/empty, confirming no data was returned for the wrong owner parameter. This is a service-side owner-predicate check, not a full second authenticated PM API test.

At this checkpoint no protection exception, import activation, discovery window, live submission, new deployment or production code change occurred. The prepared Vercel Add Domain dialog was cancelled without saving. Systeme.io secret-entry and unsaved Roma editor tabs remain open as handoffs. Evidence: output/systeme-integration-qa/systeme-roma-unsaved-fields.png (draft only).

Next prerequisite is the user's acknowledgement that the existing secret has been reentered into the open webhook modal WITHOUT saving. Then resolve/verify the public form save, conduct the already authorized temporary preview test, and restore all protections/paused states. Do not publish production or call end-to-end validation complete while these checks are pending.

## Real signed flow delivery and restored safe state

After the user reported ready, the agent verified the existing signing secret was present in the intended webhook modal. It was held only in browser-session memory to enable and later pause that same webhook; no regeneration, local file, log output or environment-variable change was made. The value was cleared from memory after pausing. A final modal check showed Attivo=false and an empty secret field.

Temporarily exempted ONLY the stable preview alias from Vercel Authentication, with the user's explicit approval. General Require Log In stayed checked, and no automation bypass token was created. External requests reached the app but unauthenticated GET /api/marketing/integrations/systeme/flows and unsigned POST to the pilot webhook both returned HTTP 401.

Systeme.io context checks found a newly opened funnel tab in the main Mattia Papale account, where the test funnel returned 403; a webhook save in the stale tab navigated to not-found. Selected the authorized Test Integrazione subaccount and reloaded the correct webhook/funnel routes before testing. Both selected-page opt-in steps had no automation rules. Retrying the copied Roma editor in the correct context ultimately published its four inputs: neighborhood, city, first_name, email. The original Milano form still has first_name/email. The earlier warning is no longer an unresolved form-save blocker; do not infer a general provider outage from it.

The preview's native accessibility tree also exposed an Iubenda overlay that the DOM snapshot had omitted. Dismissed it before executing settings changes. Native browser-tab AX actions, followed by UI/API state checks, confirmed discovery actually started. Do not treat an unverified locator click as a successful configuration command.

### Verified deliveries

Eight new signed provider events were received (in addition to the earlier basic pilot event):

- Two events while parent import was paused: ignored / connection_disabled, no contact writes. One was before discovery was actually started; the later one collected metadata during the explicit window.
- New Milano contact imported into 9d4bac0f-c60c-446f-a47f-37fd740a1cc8. Event fef3c228-bf4f-478b-8ff8-2bc5fa54cac8; contact c731d5aa-d347-4a71-9ed8-eaaca3a131b3, named TEST FLOWS Milano. Ten bindings include explicit country -> additional answer Nazione rilevata (test), stored as IT.
- Roma submitted while that specific flow was paused: ignored / flow_paused, no contact write. Metadata still collected during the authorized discovery window. Event 886d3e9b-1206-454c-b180-e00e2be40053.
- Added the actually discovered neighborhood source to the Roma mapping as additional answer Zona preferita; city remained a built-in CRM mapping. After explicitly enabling Roma, event f9127304-f2fe-4161-9193-2da87e753317 imported contact 99e32400-1e99-4277-b899-5ceb445e61b3 (TEST FLOWS Roma) into 42ebc9ed-650a-4569-888f-067f2dd520ab, with city=Roma and extra answer EUR, Garbatella. Roma has eleven bindings, with country explicitly ignored.
- Three repeated opt-ins updated existing contact identities without adding CRM rows. The preexisting name, nonempty city and additional answer were retained despite changed incoming values. For the NEW synthetic Milano record only, a narrowly scoped service update set a QA note and moved it temporarily to the Roma test stage; the following Milano opt-in preserved both the manual stage and note. That record was restored to the Milano stage after verification. No preexisting customer contact was edited.

The CRM browser navigation asked for login again, so the live imported-answer rendering could not be inspected after these deliveries. Session expiry was suspected but not independently proven. Read-only DB checks verified the actual records/answer rows. Earlier local UI tests are NOT a substitute for this pending authenticated view. The maintenance writes above and final pause used narrowly scoped service-side operations because the browser session no longer reached the CRM, not impersonation or copied browser tokens.

### Important provider limitation: sourceURL is first origin

The repeated Milano contact was intentionally submitted through the Roma form. Systeme.io's own rendered message log showed ONLY a contact object; its sourceURL still pointed to the ORIGINAL Milano acquisition URL, while fields contained the newly submitted Roma city/neighborhood. Lead Host therefore correctly selected the Milano flow. No current opt-in page/funnel field was present in that payload. Do not invent or infer the latest page from city/answers.

An initial QA assertion expected a second, Roma-scoped extra answer on the Milano contact. It failed (one answer remained instead of two). Investigation confirmed the provider first-origin behavior, not a failed transaction: the event used Milano bindings, whose neighborhood source was unconfigured. This was not fixed by changing SQL, parser routing or customer data. The assertion was not counted as a passing cross-flow-routing test.

New contacts routed to their true initial landing/stage. Existing contacts remained single CRM records and retained manual work, but per-page filtering follows the sourceURL reported by Systeme.io, NOT necessarily the last form submitted. Discovery likewise observes a contact snapshot associated with that sourceURL; it is not a guaranteed inventory of inputs present on that physical form. The latest catalog consequently has five observed slugs for each source, although Milano's visible form still has only name/email. Unknown fields stay ignored unless explicitly mapped.

Added a synthetic regression case in flows.test.ts asserting routing follows the provider URL and never guesses a newer page from contact fields. All 54 Systeme.io TypeScript tests, targeted ESLint and the full TypeScript no-emit check passed. This documents the current contract; it does not overcome the external limitation. Confirm this first-origin behavior is acceptable before client publication, or design an explicit per-form signal/automation in a separate scoped step. Do not silently promise latest-page routing or broaden to tag events without design/security review.

### Final restoration and remaining handoff

- Parent import disabled and discovery stopped through the existing versioned server-only configure RPC, with fresh snapshot tokens and the pilot owner's profile, yielding revision 9. The two flows remain configured/enabled but cannot import while the parent is paused.
- External test webhook saved paused, then reopened to confirm Attivo=false. Reused only the existing user-provided secret, without rotating it, and cleared it from working memory afterward.
- Removed the single temporary Vercel exception using Restore Protection. Require Log In=true; zero Unprotected Domains tables; external preview GET again returns HTTP 302 to Vercel Authentication. Temporary public exposure lasted approximately seven minutes.
- Final CRM count: nine total; all seven original row fingerprints match the baseline. Exactly two new synthetic contacts remain. Additional-answer rows: two (Milano nation and Roma zone). Event totals: nine including the prior event, with two new imported, three updated, three ignored and zero failed. Catalogue metadata rows: ten, without submitted values.
- Remote main remains 661f41f00e0cce4e9c0d0e59c350b8902aa92b92; remote preview remains 2c94c16f0751f62527bb4ca7533852178e3ebbe1. No production application deployment, migration, new dependency or environment-variable change occurred during testing.
- Evidence: output/systeme-integration-qa/flows-webhook-final-paused.png. The generated untracked fingerprints/check helper remain local; do not stage tmp/output or secret-bearing state. The sourceURL finding is based on actual rendered provider logs, not inferred private browser state.

Next: the user must sign in again as businesspronto.it@gmail.com in the existing protected preview /app/marketing/crm tab. Inspect both TEST FLOWS contact details, read-only answers and notes, then complete the remaining authenticated authorization checks and agree the first-origin semantics before any production publication. Live identical-message redelivery and a real concurrent import/config lock race were not exercised; isolated tests cover them, and the earlier two-tab conflict only covers optimistic configuration saves. Do not call all end-to-end/authorization/concurrency checks complete.

## Authenticated CRM visual verification - 2026-10-16

After the user signed in again, inspected the actual protected preview CRM as Luca Card / businesspronto.it@gmail.com. No fixture, copied session token, contact save, import activation or external configuration write was used.

- TEST FLOWS Roma shows stage TEST - Lead Roma and city Roma. Its separate read-only Risposte da Systeme.io section renders Zona preferita (TEST - Proprietari Roma) = EUR, Garbatella.
- TEST FLOWS Milano shows stage TEST - Lead Milano, city Roma from the previously documented repeated opt-in, and the preserved manual QA note. Its answer section contains only Nazione rilevata (test) (TEST - Proprietari Milano) = IT, not the other contact's answer.
- Opened the older Test Integrazione Lead Host contact. Once loading completed, the empty additional-answer section disappeared without an error. Closed every dialog without saving.
- The tab's captured error-log query returned no entries at this checkpoint. This does not assert that every browser context or future request is error-free.
- Re-ran the read-only fingerprint helper: all seven preexisting contacts unchanged, nine total contacts, parent disabled, discovery null, revision 9 and unchanged event totals. No application code, migration, production deployment or Vercel protection setting changed.
- Evidence: output/systeme-integration-qa/crm-real-roma-answers.png and crm-real-milano-answers.png. These show real imported synthetic-test answers in the authenticated preview, unlike the earlier local fixture screenshots.

This closes the pending actual CRM rendering check. A second authenticated PM denial check, live identical-message redelivery and live import/config lock race remain unexecuted; the existing isolated tests are not presented as live proof. Before production publication, confirm the documented first-acquisition sourceURL behavior is acceptable or separately design an explicit per-form signal. Keep both the parent import and external webhook paused, and retain preview authentication.

## Autonomous API isolation checks - 2026-10-16

Added scripts/test-systeme-api.test.mjs, a test-only runner that transpiles and executes the actual answers route, flows route, Marketing access guard and flow schemas in isolated Node VM modules. Run with node --experimental-vm-modules --test scripts/test-systeme-api.test.mjs. It uses the existing TypeScript, Next and Zod dependencies; no package or application-code change is required. No environment file, real credential, network request or database write is used.

The profile-context provider, Supabase client, audit sink and credential boundary are simulated. Consequently this is a real route/guard contract test with two synthetic PM identities, NOT a live Supabase JWT-validation or second-account browser test. The service-client fixture intentionally includes a mismatched-owner answer to exercise the route's additional owner predicate.

All 12 new cases passed: both GET routes reject missing/invalid/suspended identities, inappropriate roles and inactive Marketing access; each PM receives only its own answers; URL ownership spoofing cannot bypass the initial contact check or either answer predicate; invalid UUID/page inputs are rejected; pagination and stable ordering are retained; internal DB details do not reach responses/logs; flow RPCs derive their owner/integration from authenticated context; strict PATCH validation rejects supplied owner fields; successful writes bind owner/audit while conflicts return 409 without success audit; activation without a configured secret is rejected before a mutating RPC.

Targeted ESLint passed. Re-ran all 54 existing Systeme TypeScript tests and the full isolated database runner successfully, including the original importer suite after migration 004. Total application cases: 66, plus the SQL suites. Node's VM experimental-feature and existing tsx module.register deprecation warnings are non-fatal test-runtime notices. Initial runner-only Windows ESM-resolution and cross-realm assertion problems were repaired in the test harness; no production defect or application behavior change resulted.

No browser login, new user, live contact mutation, import activation, migration, environment change or deployment was performed in this step. The separate real second-PM login remains pending, as do live identical-message redelivery and a live configuration/import lock race. Existing first-origin sourceURL semantics and the production-release decision still require acknowledgement; do not silently promise routing by the most recent form.

## Authorized second test PM Marketing access - 2026-10-16

The user explicitly requested enabling Marketing for the existing second test account test@leadhost.it so the live owner-isolation test can proceed. Read-only preflight confirmed profile ef9ae66b-2310-41e0-b5ce-6e3fe1ce8be8 is active, has the property_manager role and had no Marketing subscriptions. No new account or role was created.

Assigned a seven-day, non-renewing manual access using the existing addon_subscriptions representation, not Stripe. Subscription fb2b56a3-9af4-4d7d-a92b-ed4bdac10661 is active/manual with access_expires_at=2026-10-23T05:28:21.683Z, no Stripe subscription ID, and an explicit test-purpose reason. The shared database makes this entitlement valid on both preview and production for this test account only. The user was informed before the write.

No authenticated admin browser session was available, so this was a narrowly scoped service-role maintenance operation using existing local credentials in memory. granted_by and event actor_profile_id remain null rather than fabricating an authenticated actor. addon_access_events record cce59e4d-f12f-4a0a-b25b-659580a67ba6 records manual_granted, reason, expiry and authorized_test_maintenance provenance. The ignored local helper has fixed operation/record identifiers, checks account/product/role/current access and will not overwrite another subscription or extend this one on a rerun. No credentials were printed or copied to files.

Readback confirmed active/manual access, future expiry, null stripe_subscription_id and the saved event. The post-operation read-only CRM baseline check still shows seven preexisting contacts unchanged, nine total contacts, parent import disabled, discovery null, revision 9 and nine webhook events. No application publication, migration, integration activation, contact mutation or billing operation occurred. Next the user signs into the protected preview as test@leadhost.it; do not substitute impersonation or copied tokens for that login.

## Real second PM visual isolation - 2026-10-16

The user signed into the protected preview as test@leadhost.it. The actual browser sidebar confirmed Mario Rossi / test@leadhost.it and Marketing ATTIVO. No copied token, session impersonation, new credential or additional entitlement write was used.

- Integrazioni showed Importazione contatti nel CRM Non configurata, Crea collegamento and Nessun invio ricevuto. Clicked only the read-only Controlla ricezione action; the completed refresh still showed no integration/events, not the pilot owner's two flows or receipt history.
- CRM showed the second PM's own default pipeline with nine zero-contact stages. Neither TEST FLOWS Milano/Roma nor the pilot's custom stages appeared. No contact, stage edit or integration-create action was performed. Opening CRM may run its existing default-pipeline initialization; this is normal application behavior, not an explicit test fixture write.
- Independent read-only counts scoped to the second profile confirmed zero CRM contacts, zero integrations, zero additional answers and zero webhook events. The pilot baseline still confirmed all seven original contacts unchanged, nine total contacts, parent paused, discovery off, revision 9 and nine existing events. No captured browser error logs were returned at this checkpoint.
- Evidence: output/systeme-integration-qa/second-pm-integrations-isolated.png and second-pm-crm-isolated.png. The former screenshot is scrolled to the empty receipt history; the account identity and unconfigured connection were verified in the full native accessibility state.

This completes a live second-account check of the rendered CRM/integration lists. It does NOT claim a direct live HTTP 404 test using the second user's bearer token against a foreign contact ID: the UI exposes no such read action and the agent did not extract or replay session credentials. The isolated route/guard tests cover that negative API request, and isolated RLS tests cover row isolation. Live identical-message redelivery and live configuration/import locking remain unexercised. No deployment, webhook/protection change or import activation occurred. Before release, ask the user to acknowledge the provider's first-origin page-filter semantics; do not silently change routing or present latest-form routing as supported.
