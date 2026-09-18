import test from "node:test";
import assert from "node:assert/strict";
import { readAllReportRows, subscriptionReportingPrice } from "./reporting";

test("Marketplace reporting keeps the agreed price after catalog changes", () => {
  assert.equal(subscriptionReportingPrice("marketplace", { monthly_price_cents: 2900 }, 4900), 2900);
  assert.equal(subscriptionReportingPrice("marketplace", {}, 4900), null);
  assert.equal(subscriptionReportingPrice("marketplace", { monthly_price_cents: -1 }, 4900), null);
  assert.equal(subscriptionReportingPrice("marketing", {}, 4900), 4900);
});

test("reporting reads beyond the database default row limit", async () => {
  const rows = Array.from({ length: 1203 }, (_, id) => ({ id }));
  const result = await readAllReportRows(async (from, to) => ({ data: rows.slice(from, to + 1), error: null }));
  assert.equal(result.data.length, 1203);
  assert.equal(result.data[1202].id, 1202);
});

test("partial database failure cannot produce an apparently complete total", async () => {
  await assert.rejects(readAllReportRows(async from => {
    if (from) return { data: null, error: new Error("Database failed") };
    return { data: Array.from({ length: 500 }, (_, id) => id), error: null };
  }), /Database failed/);
});
