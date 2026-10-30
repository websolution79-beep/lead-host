# Access incident: 30 October 2026

Production logs around 15:43-15:52 Europe/Rome showed `EMFILE`, DNS `EBUSY`,
database statement timeouts and 300-second lifecycle/session function timeouts.
Protected page middleware also timed out after 25 seconds. Public login and
lightweight read-only Supabase health/database checks remained responsive.

The public lead broadcaster launched one delivery per recipient concurrently,
and the opportunistic lifecycle launched up to five broadcasts concurrently.
Each delivery also loaded its template separately. Session creation additionally
drained unrelated Brevo jobs after every login.

## Mitigation

- Broadcast recipients use three workers; lifecycle/expiry broadcasts are serial.
- Resolve the broadcast template once per invocation, preserving admin settings.
- Stable per-lead/per-profile Resend idempotency keys protect concurrent retries.
- Failed recipient/deduplication reads throw rather than reporting successful
  completion or retrying everyone without duplicate checks.
- Coalesce lifecycle heartbeats for 30 seconds per warm instance. This is not
  a distributed lock; database eligibility and provider idempotency still apply.
- Login no longer processes Brevo's unrelated backlog. Existing signup,
  purchases, worker endpoints and scheduled reconciliation still process it.
- Bound login session initialization, provider sends and middleware refresh
  requests. Middleware preserves cookies on temporary errors/429 instead of
  treating an upstream outage as an invalid refresh token.
- Use the publishable-key fallback consistently during middleware refresh.
- Correct lifecycle notification ordering to `prime_access_started_at`, the
  column present in the deployed schema.

No migration, credential reset, permission change or wallet/payment mutation.
No production lifecycle/worker job is invoked as a diagnostic test, because
that would send real notifications. Automated route and broadcaster tests mock
providers; browser/read-only production verification supplements them.

## Follow-up

Broadcasts can still exceed request duration with a large audience: retain
successful delivery logs and retry unsent recipients. A durable outbox with
cross-instance claims is preferable long term. Per-instance coalescing does
not replace a distributed scheduler. Monitor error counts and latency after
the patch rather than attributing every historical timeout to one cause.
