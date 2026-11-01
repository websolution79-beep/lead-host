# Lead list optimization: staged rollout

## Stage 1: additive backend preparation

`admin_lead_list_page_v1` computes full-archive filters, literal joined-field
search, global counts and a bounded ordered page of owner-request IDs inside
PostgreSQL. EXECUTE is restricted to service_role; existing RLS is untouched.
No table writes, indexes, triggers or lifecycle operations are introduced.

The new API path is opt-in via `filter`. Existing consumers without that
parameter retain the full response and the current pipeline behavior. `new`
is deliberately not a list filter. When the function is not installed, existing
behavior remains available. A timeout must never trigger a full archive retry.

The record loader now accepts an optional private scope of IDs. Unscoped calls
are unchanged, including the missing-subletting-column compatibility fallback.
Empty scopes return without queries; scoped requests hydrate only those leads.
This prepares pagination and later lazy detail loading without changing writes.

## Preserve current semantics

- Sold means at least one paid/contact_unlocked purchase, not only current
  internal status. Refunded-only purchases do not qualify.
- Prime list includes private leads, while its existing counter counts active
  private availability. Those are intentionally not conflated in this change.
- Marketplace visibility and expired rules match the existing helper exactly,
  including >= at visibility boundaries and the existing private/public rules.
- Duplicate warnings exclude published and rejected requests.
- Search keeps the existing concatenated name/contact/location/description/title
  behavior. Percent and underscore are literal characters, not SQL wildcards.

## Checks

216 combinations of filter/search/page compared against the existing JS helpers
using isolated PostgreSQL seeded from minimal live SELECTs. Stable ordering and
global counts matched. Scoped hydration of 25 records equalled the same records
from the archive, including notes, operational activity, purchases and pricing.
No production mutations or emails. Local benchmark: full hydration 4440 ms,
25-record hydration 859 ms; not a browser or production-page speed guarantee.

## Stage 2: lists and lazy detail

The list UI now opts in to server pagination, debounces list search, cancels
superseded fetches and ignores out-of-order responses. Page totals stay global;
the last page is corrected when a mutation shrinks the result set. The pipeline
still calls the original unfiltered endpoint and searches locally.

List hydration projects only row fields. Notes, consents, operational details,
pricing, duplicate matches and editor data are loaded via the authorized
no-store detail GET when requested. No edit/publish actions render before a
complete detail has loaded. Closing/reselecting cancels obsolete detail loads.
Saving the editor refreshes the list and the selected detail; existing draft
state is preserved. Old clients retain the original unfiltered response.

## Completed verification

- Applied SQL checked read-only on live data: 18 first/last-page checks, anon
  execution denied. Summary display fields match full records.
- Actual GET handlers exercised with real SELECTs and a mocked auth guard:
  global stats match, full detail matches legacy data, invalid IDs rejected,
  missing IDs return 404, no-store detail response.
- Local mocked-provider browser checks at 1440px and 390px: server pages,
  search beyond page one, debounce/races, lazy detail, editor save, detail and
  list failure/retry, close while loading, empty pages, page shrink, legacy
  fallback, pipeline local search and move behavior. No real writes or sends.
- Backend sample with auth guard mocked: legacy 4972ms / 1,142,846 bytes;
  paginated summary 548ms / 13,560 bytes. Not full browser latency.

## Production release sequence

1. User applies `202611010002_admin_lead_list_pagination.sql`.
2. Verify service-role RPC results against fresh data; anon/authenticated denied.
3. Build preview and verify its commit before merging.
4. Verify production alias, anonymous denial and recent runtime errors.
5. Ask an authorized admin to confirm the visible live list. Browser automation
   uses mocked providers, not a signed-in production user session.

Rollback uses the old reader; leave the unused read-only SQL function in place
safely. No pipeline component, assignment, purchase, estimate, commission or
mutation endpoint is changed by this optimization.
