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

## Next steps before production release

1. User applies `202611010002_admin_lead_list_pagination.sql`.
2. Verify service-role RPC results against fresh data; anon/authenticated denied.
3. Connect list tabs, server pagination and debounced search in the UI. Keep
   pipeline requests unscoped and unchanged. Protect against stale responses.
4. Add lazy detail GET and UI loading states, preserving draft/action behavior.
5. Test search beyond page one, all tabs, empty/last pages, permissions, promotion,
   estimate/detail/edit actions and pipeline regression. Then release gradually.

Stage 1 does not yet speed up the live UI: the new reader must be connected and
verified first. No production publication is made at this stage. Rollback uses
the old reader; leave the unused read-only SQL function in place safely.
