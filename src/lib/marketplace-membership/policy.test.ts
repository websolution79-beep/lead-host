import assert from "node:assert/strict";
import test from "node:test";
import {
  marketplaceMembershipSettingsSchema, marketplaceMonthlyPrice,
  resolveMarketplaceMembershipAccess,
} from "./policy";

const now = Date.parse("2026-09-16T12:00:00Z");
const future = "2026-10-16T12:00:00Z";
const input = { paidAccessEnabled: true, hasPrimeAccess: false, subscription: null, now };

test("open marketplace and valid PRIME do not require a membership", () => {
  assert.equal(resolveMarketplaceMembershipAccess({ ...input, paidAccessEnabled: false }), "open");
  assert.equal(resolveMarketplaceMembershipAccess({ ...input, hasPrimeAccess: true }), "prime");
  assert.equal(resolveMarketplaceMembershipAccess(input), "required");
});

test("access lasts through the paid or trial period, including a scheduled cancellation", () => {
  for (const status of ["active", "trialing"]) {
    const subscription = { status, trialEndsAt: future, periodEndsAt: future };
    assert.equal(resolveMarketplaceMembershipAccess({ ...input, subscription }), "subscription");
    assert.equal(resolveMarketplaceMembershipAccess({ ...input, subscription, now: Date.parse(future) }), "required");
  }
});

test("unpaid, canceled, incomplete and unknown expiration do not grant access", () => {
  for (const status of ["past_due", "unpaid", "canceled", "incomplete", "paused"]) {
    assert.equal(resolveMarketplaceMembershipAccess({ ...input,
      subscription: { status, trialEndsAt: future, periodEndsAt: future } }), "required");
  }
  assert.equal(resolveMarketplaceMembershipAccess({ ...input,
    subscription: { status: "active", trialEndsAt: null, periodEndsAt: null } }), "required");
});

test("price configuration rejects invalid promotions and permits a disabled draft", () => {
  const settings = { paidAccessEnabled: false, listPriceCents: null,
    promoEnabled: false, promoPriceCents: null, trialDays: 0 };
  assert.ok(marketplaceMembershipSettingsSchema.safeParse(settings).success);
  assert.equal(marketplaceMembershipSettingsSchema.safeParse({ ...settings, paidAccessEnabled: true }).success, false);
  assert.equal(marketplaceMembershipSettingsSchema.safeParse({ ...settings, promoEnabled: true }).success, false);
  assert.equal(marketplaceMembershipSettingsSchema.safeParse({ ...settings,
    listPriceCents: 2900, promoPriceCents: 3900, promoEnabled: true }).success, false);
  assert.equal(marketplaceMonthlyPrice({ ...settings, listPriceCents: 3900 }), 3900);
  assert.equal(marketplaceMonthlyPrice({ ...settings, listPriceCents: 3900,
    promoPriceCents: 2900, promoEnabled: true }), 2900);
});
