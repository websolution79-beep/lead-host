# Property Manager list pagination

## Scope

Add a service-only SQL read function and a fast path for the existing admin
GET list. No profile, wallet, billing, compensation, signup or permission data
is rewritten. Detail, export, analysis and mutation routes are unchanged.

The function searches the entire PM role population, including profiles with
no extended PM row. Effective city and property range keep the existing
profile-first / Auth signup-metadata fallback. Search remains literal substring
matching, not SQL wildcard matching. Numeric count is a display fallback only,
as before. Search semantics are unchanged (primary city, not a new interests filter).

Pagination happens in PostgreSQL; only one page of rows is serialized to the
API. Totals remain global. Wallet data is joined after pagination. Two projected
Auth signup fields are read inside SQL; no Auth user directory is returned.
Ordering adds ID as a stable tie-breaker after creation date.

## Rollout

1. Apply `202611010001_admin_pm_list_pagination.sql`. It adds only a function,
   restricts EXECUTE to service_role, and reloads PostgREST's schema cache.
   It does not create tables, modify RLS or add blocking table indexes.
2. Verify the function is inaccessible to anon/authenticated and compare live
   read-only results with the previous list implementation.
3. Deploy the API change after preview checks pass. Without the function the
   API uses the old implementation, preventing deployment-order outages.
4. Check first/last pages, empty results, city/name searches and property-range
   filters with an authorized admin/team account. Check detail and export too.

Do not turn every SQL error into a legacy fallback: a transient database error
must not launch a second full-archive workload.

## Verification before migration

168 combinations of search/filter/page were compared to the previous JS
semantics in isolated PostgreSQL, seeded with minimally selected live records.
All passed, including legacy signup fields and profiles without extended rows.
At extraction: 953 PM-role profiles, 916 active, 37 suspended, 8 active PRIME.
No production writes or emails were performed. These totals are a test snapshot,
not constants in the implementation. Production latency is not yet measured
for the new function before migration.

## Rollback

Revert the API deployment to restore the old reader. The unused read function
can remain safely in place; no data rollback is needed. Do not drop it while
the optimized API is serving traffic.
