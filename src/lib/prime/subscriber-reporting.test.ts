import test from "node:test";
import assert from "node:assert/strict";
import {
  isPrimeSubscriber,
  matchesPrimeSubscriberStatus,
} from "./subscriber-reporting";

const activeAccount = {
  status: "active",
  access_source: "stripe",
  prime_started_at: "2026-09-01T00:00:00.000Z",
  prime_expires_at: "2026-10-01T00:00:00.000Z",
  grace_ends_at: null,
};

test("PRIME subscriber requires an actual access source and activation date", () => {
  assert.equal(isPrimeSubscriber(activeAccount), true);
  assert.equal(isPrimeSubscriber({ ...activeAccount, access_source: "none" }), false);
  assert.equal(isPrimeSubscriber({ ...activeAccount, prime_started_at: null }), false);
  assert.equal(isPrimeSubscriber(null), false);
});

test("PRIME subscriber filters distinguish active and cancellation scheduled", () => {
  assert.equal(
    matchesPrimeSubscriberStatus(
      { account: activeAccount, subscription: { cancel_at_period_end: false, current_period_ends_at: null } },
      "active",
    ),
    true,
  );
  assert.equal(
    matchesPrimeSubscriberStatus(
      { account: activeAccount, subscription: { cancel_at_period_end: true, current_period_ends_at: null } },
      "active",
    ),
    false,
  );
  assert.equal(
    matchesPrimeSubscriberStatus(
      { account: activeAccount, subscription: { cancel_at_period_end: true, current_period_ends_at: null } },
      "canceling",
    ),
    true,
  );
});

test("PRIME subscriber expiring filter uses a seven day window", () => {
  const now = Date.parse("2026-09-24T00:00:00.000Z");
  assert.equal(
    matchesPrimeSubscriberStatus(
      {
        account: activeAccount,
        subscription: {
          cancel_at_period_end: false,
          current_period_ends_at: "2026-09-30T00:00:00.000Z",
        },
      },
      "expiring",
      now,
    ),
    true,
  );
});
