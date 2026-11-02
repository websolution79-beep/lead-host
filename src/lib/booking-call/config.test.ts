import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchBookingCallConfig, fetchBookingCallWorkflowConfig, quoteBookingCall, type BookingCallConfig } from "./config";

const config: BookingCallConfig = { schemaVersion: 1, storageReady: true, enabled: true, feeCents: 1500, compensationCents: 300, currency: "EUR" };

test("booking quote separates lead, service, total and fixed qualifier compensation", () => {
  assert.deepEqual(quoteBookingCall({ config, leadAmountCents: 5000, visibilityMode: "public", exclusiveAvailable: true }), {
    leadAmountCents: 5000, bookingFeeCents: 1500, totalAmountCents: 6500, compensationCents: 300, currency: "EUR",
  });
});

test("purchase workflow stays closed until every workflow migration is installed", async () => {
  for (const data of [null, { ...config, schemaVersion: 2, engineReady: true }, { ...config, schemaVersion: 3, engineReady: false, workflowReady: true }]) {
    const result = await fetchBookingCallWorkflowConfig({ rpc: async () => ({ data, error: null }) });
    assert.equal(result.workflowReady, false); assert.equal(result.enabled, false);
  }
  const ready = await fetchBookingCallWorkflowConfig({ rpc: async (name: string) => {
    assert.equal(name, "get_marketplace_booking_call_readiness_v3");
    return { data: { ...config, schemaVersion: 3, engineReady: true, workflowReady: true }, error: null };
  } });
  assert.equal(ready.workflowReady, true); assert.equal(ready.enabled, true);
});

test("public-only booking never bypasses exclusive availability or the rollout gate", () => {
  for (const value of [
    { config: { ...config, storageReady: false } }, { config: { ...config, enabled: false } },
    { visibilityMode: "prime_private" }, { exclusiveAvailable: false },
    { config: { ...config, feeCents: 0 } },
  ]) assert.equal(quoteBookingCall({ config, leadAmountCents: 5000, visibilityMode: "public", exclusiveAvailable: true, ...value }), null);
  const invalidConfig = { ...config, compensationCents: 500 } as unknown as BookingCallConfig;
  assert.equal(quoteBookingCall({ config: invalidConfig, leadAmountCents: 5000, visibilityMode: "public", exclusiveAvailable: true }), null);
});

test("invalid cents and overflow cannot produce a wallet quote", () => {
  for (const amount of [0, -1, 1.5, NaN, Infinity, 2147483647]) {
    assert.equal(quoteBookingCall({ config, leadAmountCents: amount, visibilityMode: "public", exclusiveAvailable: true }), null);
  }
  for (const feeCents of [-1, 0.1, NaN, Infinity, 2147483648]) {
    assert.equal(quoteBookingCall({ config: { ...config, feeCents }, leadAmountCents: 5000, visibilityMode: "public", exclusiveAvailable: true }), null);
  }
});

test("schema/configuration errors disable only the new option without affecting normal purchases", async () => {
  for (const result of [
    { data: null, error: { code: "PGRST202" } }, { data: null, error: { code: "57014" } },
    { data: { ...config, schemaVersion: 2 }, error: null }, { data: { ...config, feeCents: "1500" }, error: null },
    { data: { ...config, compensationCents: 500 }, error: null }, { data: null, error: null },
  ]) {
    const actual = await fetchBookingCallConfig({ rpc: async () => result });
    assert.equal(actual.enabled, false); assert.equal(actual.storageReady, false);
  }
  assert.equal((await fetchBookingCallConfig({ rpc: async () => { throw Error("offline"); } })).enabled, false);
});

test("installed dormant configuration remains off; a configured positive fee is preserved", async () => {
  let calls = 0;
  const loaded = await fetchBookingCallConfig({ rpc: async (name: string) => {
    calls++; assert.equal(name, "get_marketplace_booking_call_readiness_v1");
    return { data: { ...config, enabled: false }, error: null };
  } });
  assert.equal(calls, 1); assert.equal(loaded.storageReady, true); assert.equal(loaded.enabled, false); assert.equal(loaded.feeCents, 1500);
  assert.equal((await fetchBookingCallConfig({ rpc: async () => ({ data: { ...config, feeCents: 0 }, error: null }) })).enabled, false);
});
