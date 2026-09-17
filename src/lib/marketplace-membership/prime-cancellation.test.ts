import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import { cancelMarketplaceRenewalForPrime } from "./prime-cancellation";
import { primeIncludesMarketplace } from "./access";

const expected = { stripeSubscriptionId: "sub_market", localSubscriptionId: "local_market", profileId: "pm" };
const base = { id: "sub_market", status: "active", cancel_at_period_end: false,
  metadata: { addon_slug: "marketplace", profile_id: "pm", addon_subscription_id: "local_market" } };
function mock(overrides: object = {}) {
  const updates: Stripe.SubscriptionUpdateParams[] = [];
  const current = { ...base, ...overrides };
  const stripe = { subscriptions: { retrieve: async () => current,
    update: async (_id: string, params: Stripe.SubscriptionUpdateParams) => {
      updates.push(params); return { ...current, ...params };
    } } } as unknown as Stripe;
  return { stripe, updates };
}

test("PRIME schedules only Marketplace period-end cancellation", async () => {
  const { stripe, updates } = mock();
  await cancelMarketplaceRenewalForPrime(stripe, expected);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].cancel_at_period_end, true);
  assert.ok(updates[0].metadata && typeof updates[0].metadata === "object");
  assert.equal(updates[0].metadata.marketplace_cancellation_reason, "included_in_prime");
  assert.equal(updates[0].items, undefined);
  assert.equal(updates[0].proration_behavior, undefined);
});
test("retries and terminal or incomplete subscriptions do not trigger Stripe updates", async () => {
  for (const overrides of [{ cancel_at_period_end: true }, { status: "canceled" },
    { status: "incomplete_expired" }, { status: "incomplete" }]) {
    const { stripe, updates } = mock(overrides);
    await cancelMarketplaceRenewalForPrime(stripe, expected);
    assert.equal(updates.length, 0);
  }
});
test("wrong product, PM or local subscription fail closed", async () => {
  for (const overrides of [{ addon_slug: "marketing" }, { profile_id: "other" }, { addon_subscription_id: "other" }]) {
    const { stripe, updates } = mock({ metadata: { ...base.metadata, ...overrides } });
    await assert.rejects(cancelMarketplaceRenewalForPrime(stripe, expected));
    assert.equal(updates.length, 0);
  }
});
test("PRIME access respects expiration, manual access and the existing grace period", () => {
  const now = Date.parse("2026-09-17T10:00:00Z");
  const future = "2026-09-18T10:00:00Z";
  const past = "2026-09-16T10:00:00Z";
  assert.equal(primeIncludesMarketplace(null, now), false);
  assert.equal(primeIncludesMarketplace({ status: "active", prime_expires_at: future, grace_ends_at: null }, now), true);
  assert.equal(primeIncludesMarketplace({ status: "active", prime_expires_at: null, grace_ends_at: null }, now), true);
  assert.equal(primeIncludesMarketplace({ status: "active", prime_expires_at: past, grace_ends_at: null }, now), false);
  assert.equal(primeIncludesMarketplace({ status: "past_due", prime_expires_at: past, grace_ends_at: future }, now), true);
  assert.equal(primeIncludesMarketplace({ status: "cancelled", prime_expires_at: future, grace_ends_at: future }, now), false);
});
