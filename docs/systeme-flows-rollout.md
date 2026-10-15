# Systeme.io flows and field mapping

## Status

1. Completed: additive schema, compatibility plan and isolated database tests. Migration 202610150003 was applied through the production project's Supabase SQL Editor after explicit user authorization on 2026-10-15.
2. Completed: read-only SQL/API checks confirmed five RLS-protected tables, unchanged legacy/paused connection, one initial paused flow, empty mapping/discovery/extra/context tables and unchanged CRM contact/event counts.
3. Pending: versioned configuration API and atomic import extension for flows, field mapping and discovery.
4. Pending: flow editor, duplication, field discovery/mapping and CRM additional answers view.
5. Pending: preview tests for Milan/Rome routing, distinct field schemas, duplicates, paused flows and tenant isolation.
6. Pending: production deployment and client instructions. Do not publish before these additions are tested.

Existing production code remains at 661f41f. Preview 59397fb passed the basic Systeme.io pilot; both the Lead Host connection and Systeme.io webhook are paused, and Vercel protection has been restored. The pilot database contains seven private CRM contacts: six originals and one identifiable test contact.

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

Migration 202610150003 is applied and verified; do not ask the user to run it again. Next implement the versioned configuration API and atomic flow/mapping import extension locally, preserving legacy behavior. Then build the editor/additional-fields UI and run the multi-flow preview tests before production publication. Any further migration must receive its own isolated validation and rollout step. Do not run fixtures/tests against production or enable the pilot implicitly.
