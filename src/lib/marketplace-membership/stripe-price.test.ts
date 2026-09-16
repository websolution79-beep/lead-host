import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import { ensureMarketplacePrice } from "./stripe-price";

function fake(existing: object[] = []) {
  const created: { input: Stripe.PriceCreateParams; key?: string }[] = [];
  const stripe = { prices: {
    list: async () => ({ data: existing }),
    create: async (input: Stripe.PriceCreateParams, options: Stripe.RequestOptions) => {
      created.push({ input, key: options.idempotencyKey });
      return { id: "price_new" };
    },
  } } as unknown as Stripe;
  return { stripe, created };
}
const price = { id: "price_old", product: "prod_marketplace", unit_amount: 2900,
  currency: "eur", active: true, billing_scheme: "per_unit",
  recurring: { interval: "month", interval_count: 1 } };

test("reuses an exact monthly price without mutations", async () => {
  const { stripe, created } = fake([price]);
  assert.equal(await ensureMarketplacePrice(stripe, "prod_marketplace", 2900), "price_old");
  assert.equal(created.length, 0);
});
test("creates immutable prices with product- and amount-specific idempotency", async () => {
  const { stripe, created } = fake();
  await ensureMarketplacePrice(stripe, "prod_marketplace", 2900);
  await ensureMarketplacePrice(stripe, "prod_marketplace", 3900);
  assert.equal(created[0].input.unit_amount, 2900);
  assert.deepEqual(created[0].input.recurring, { interval: "month", interval_count: 1 });
  assert.notEqual(created[0].key, created[1].key);
});
test("rejects archived or inconsistent catalog entries", async () => {
  for (const override of [{ active: false }, { unit_amount: 3900 },
    { product: "prod_marketing" }, { currency: "usd" }]) {
    const { stripe } = fake([{ ...price, ...override }]);
    await assert.rejects(ensureMarketplacePrice(stripe, "prod_marketplace", 2900));
  }
});
test("rejects invalid amounts before Stripe calls", async () => {
  const { stripe, created } = fake();
  for (const amount of [0, -1, 1.5, NaN, 1_000_001]) {
    await assert.rejects(ensureMarketplacePrice(stripe, "prod_marketplace", amount));
  }
  assert.equal(created.length, 0);
});
