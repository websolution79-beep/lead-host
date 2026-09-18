import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import { recoverPendingMarketplaceCheckout } from "./pending-checkout";

const expected = { id: "local", profileId: "pm", productId: "product", customerId: "cus",
  sessionId: "cs", createdAt: new Date().toISOString() };
const metadata = { addon_slug: "marketplace", profile_id: "pm", addon_product_id: "product", addon_subscription_id: "local" };
const base = { id: "cs", mode: "subscription", client_reference_id: "local", customer: "cus", metadata, status: "open", subscription: "sub" };
function mock(options: { session?: object; expireError?: boolean; afterExpire?: object; subscription?: object; list?: object[] } = {}) {
  let current = { ...base, ...options.session };
  let expirations = 0;
  const stripe = {
    checkout: { sessions: {
      retrieve: async () => current,
      list: async function* () { for (const row of options.list ?? []) yield row; },
      expire: async () => {
        expirations++;
        current = { ...current, status: "expired", ...options.afterExpire };
        if (options.expireError) throw new Error("Expiration failed");
        return current;
      },
    } },
    subscriptions: { retrieve: async () => ({ id: "sub", metadata, ...options.subscription }) },
  } as unknown as Stripe;
  return { stripe, expirations: () => expirations };
}

test("open checkout stays open without PRIME", async () => {
  const m = mock();
  assert.deepEqual(await recoverPendingMarketplaceCheckout(m.stripe, expected, false), { state: "pending" });
  assert.equal(m.expirations(), 0);
});
test("PRIME expires an open owned Marketplace checkout", async () => {
  const m = mock();
  assert.deepEqual(await recoverPendingMarketplaceCheckout(m.stripe, expected, true), { state: "expired" });
  assert.equal(m.expirations(), 1);
});
test("completed checkout is recovered, never expired", async () => {
  const m = mock({ session: { status: "complete" } });
  const result = await recoverPendingMarketplaceCheckout(m.stripe, expected, true);
  assert.equal(result.state, "complete");
  assert.equal(m.expirations(), 0);
});
test("completion winning expiration race is recovered", async () => {
  const m = mock({ expireError: true, afterExpire: { status: "complete" } });
  assert.equal((await recoverPendingMarketplaceCheckout(m.stripe, expected, true)).state, "complete");
});
test("uncertain expiration keeps the reservation", async () => {
  const m = mock({ expireError: true, afterExpire: { status: "open" } });
  await assert.rejects(recoverPendingMarketplaceCheckout(m.stripe, expected, true), /Expiration failed/);
});
test("wrong owner, product or customer cannot expire a checkout", async () => {
  for (const session of [{ customer: "other" }, { metadata: { ...metadata, profile_id: "other" } },
    { metadata: { ...metadata, addon_slug: "marketing" } }]) {
    const m = mock({ session });
    await assert.rejects(recoverPendingMarketplaceCheckout(m.stripe, expected, true), /non coerente/);
    assert.equal(m.expirations(), 0);
  }
});
test("wrong subscription metadata blocks synchronization", async () => {
  const m = mock({ session: { status: "complete" }, subscription: { metadata: { ...metadata, addon_product_id: "other" } } });
  await assert.rejects(recoverPendingMarketplaceCheckout(m.stripe, expected, false), /non coerente/);
});
test("missing and ambiguous sessions never release a reservation", async () => {
  const m = mock();
  assert.equal((await recoverPendingMarketplaceCheckout(m.stripe, { ...expected, sessionId: null }, true)).state, "pending");
  await assert.rejects(recoverPendingMarketplaceCheckout(m.stripe,
    { ...expected, sessionId: null, createdAt: "2020-01-01T00:00:00Z" }, true), /verifica manuale/);
  const ambiguous = mock({ list: [base, { ...base, id: "cs2" }] });
  await assert.rejects(recoverPendingMarketplaceCheckout(ambiguous.stripe, { ...expected, sessionId: null }, true), /Piu checkout/);
});
test("session lost before database persistence can be found by customer", async () => {
  const m = mock({ list: [{ ...base, status: "expired" }] });
  assert.deepEqual(await recoverPendingMarketplaceCheckout(m.stripe, { ...expected, sessionId: null }, false), { state: "expired" });
});
