import assert from "node:assert/strict";
import test from "node:test";
import { resolveAnalyticsRange } from "./business-analytics";

test("custom range includes the selected final day", () => {
  const range = resolveAnalyticsRange({
    key: "custom",
    customFrom: "2026-07-01",
    customTo: "2026-07-07",
  });

  assert.equal(range.fromDate, "2026-07-01");
  assert.equal(range.toDate, "2026-07-07");
  assert.equal(range.toDateExclusive, "2026-07-08");
  assert.equal(range.previousFromDate, "2026-06-24");
  assert.equal(range.previousToDate, "2026-07-01");
  assert.equal(range.bucket, "day");
});

test("long custom ranges use monthly buckets", () => {
  const range = resolveAnalyticsRange({
    key: "custom",
    customFrom: "2026-01-01",
    customTo: "2026-07-29",
  });

  assert.equal(range.bucket, "month");
});

test("invalid custom ranges are rejected", () => {
  assert.throws(
    () =>
      resolveAnalyticsRange({
        key: "custom",
        customFrom: "2026-07-30",
        customTo: "2026-07-01",
      }),
    /data iniziale/i,
  );
});

test("custom ranges are limited to twenty-four months", () => {
  assert.throws(
    () =>
      resolveAnalyticsRange({
        key: "custom",
        customFrom: "2023-01-01",
        customTo: "2026-07-01",
      }),
    /periodo massimo/i,
  );
});
