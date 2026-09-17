import assert from "node:assert/strict";
import test from "node:test";
import { marketplaceCheckoutParams, marketplaceCheckoutSnapshotSchema } from "./checkout-params";

const snapshot = { terms_version: "v1", terms_accepted_at: "2026-09-17T10:00:00.000Z",
  monthly_price_cents: 2900, trial_days_requested: 15,
  checkout_email: "test@example.com", checkout_app_url: "https://www.leadhost.it" };
const input = { snapshot, customer: "cus_test", subscriptionId: "local_test",
  productId: "product_test", profileId: "profile_test", priceId: "price_agreed" };

test("trial requires a card and the immutable agreed price", () => {
  const params = marketplaceCheckoutParams(input);
  assert.equal(params.payment_method_collection, "always");
  assert.deepEqual(params.payment_method_types, ["card"]);
  assert.equal(params.subscription_data?.trial_period_days, 15);
  assert.deepEqual(params.line_items, [{ price: "price_agreed", quantity: 1 }]);
  assert.equal(params.metadata?.addon_slug, "marketplace");
  assert.deepEqual(params.metadata, params.subscription_data?.metadata);
});
test("no trial for a previously used trial and stable retry parameters", () => {
  const params = marketplaceCheckoutParams({ ...input, snapshot: { ...snapshot, trial_days_requested: 0 } });
  assert.equal(params.subscription_data?.trial_period_days, undefined);
  assert.deepEqual(marketplaceCheckoutParams(input), marketplaceCheckoutParams(input));
});
test("incomplete or invalid stored checkout snapshots are rejected", () => {
  assert.equal(marketplaceCheckoutSnapshotSchema.safeParse(snapshot).success, true);
  for (const invalid of [{}, { ...snapshot, monthly_price_cents: 0 },
    { ...snapshot, trial_days_requested: -1 }, { ...snapshot, checkout_app_url: "invalid" }]) {
    assert.equal(marketplaceCheckoutSnapshotSchema.safeParse(invalid).success, false);
  }
});
