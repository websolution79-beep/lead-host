# Lightweight operational pipeline

## Scope

The opt-in `GET /api/admin/leads?view=pipeline` uses the existing admin/team
permission guard. It returns every `to_verify` request, all ordered stages and
the unchanged global counters. `Cache-Control: no-store` prevents shared
caching. Requests without `view` retain the original full archive response.
No migration, write endpoint, RLS, commission, notification or lifecycle changes.

The dedicated reader internally pages requests and batches joins, never limits
the board to 25 cards. It retains card labels, notes, search fields, first-worker
names/colors and operational activity. Commercial settings, purchases, consent
details and complete editor data are not hydrated. Those load through the
existing authorized detail GET. Global counters still use lightweight metadata
queries across the archive; they are not counts of a limited page.

## Refresh behavior

Columns and cards arrive together, without a second stage request. Local search,
assignment filters, ordering and existing card layout remain intact.
The last successful refresh is displayed separately from each lead's activity.
GET requests never change operational activity or first-worker attribution.

While visible, the pipeline refreshes every 30 seconds and on focus/visibility
return. In-flight reads are not duplicated. Automatic refresh pauses while a
detail/editor is open or a mutation is pending. It does not run in hidden tabs
or on other Lead tabs. The previous board stays visible during refresh and on
failure, with a stale-data warning and a manual retry button.

Successful moves update the card destination after server acknowledgement,
then reconcile in the background without holding the move button busy.
Superseded reads are aborted/ignored, including a refresh interrupted by a move.
Writes retain all existing server authorization and conflict checks.

## Verification

- Four focused reader tests: 205 requests across internal pages/batches, empty
  board with stages, required-read errors, unavailable activity handling.
- Existing six lead-list unit tests and TypeScript/ESLint checks.
- Actual handler with mocked auth guard and real read-only database access:
  91 operational cards and 8 columns equal the legacy projection exactly;
  names/colors/notes/activity/search fields and global counters match.
  Sample legacy: 4808ms / 1,142,846 bytes. Pipeline: 500ms / 80,694 bytes.
  This excludes real authentication and browser rendering, not an SLA.
- Mocked-provider browser tests at 1440px and 390px: all 66 initial cards,
  full-board search, member-only assignment filter/colors, no assignment in
  intake, lazy detail, detail retry, note save, drag and detail moves,
  refresh during a move, incoming card, polling, focus refresh, refresh failure
  preserving cards, no polling while detail is open, no overflow/page errors.
- Regression tests at both widths: server list pagination, search races,
  editor, retries, cancelled details, empty/shrinking pages and legacy fallback.
- No production writes, test emails, purchases or lead changes.

## Release

Remove the temporary local QA page before staging. Build the exact Git preview
commit, merge only after build succeeds, verify the production domain SHA,
anonymous denial for the new GET and recent runtime error logs. Signed-in live
UI confirmation remains an authorized user's check; local browser tests mock
providers rather than impersonating real members.
