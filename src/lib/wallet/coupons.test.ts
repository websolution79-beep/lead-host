import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePercentageBonusCents,
  normalizeCouponCode,
  resolveCouponTier,
  validateCouponTiers,
  type WalletCouponTier,
} from "./coupons";

const launchTiers: WalletCouponTier[] = [
  { minPaidCents: 3000, maxPaidCents: 4999, bonusCents: 500 },
  { minPaidCents: 5000, maxPaidCents: 9999, bonusCents: 1000 },
  { minPaidCents: 10000, maxPaidCents: null, bonusCents: 2000 },
];

test("normalizes coupon codes", () => {
  assert.equal(normalizeCouponCode(" lancio 2026 "), "LANCIO2026");
});

test("calculates percentage bonuses and applies the per-use cap", () => {
  assert.equal(
    calculatePercentageBonusCents({
      paidAmountCents: 10_000,
      percentageBasisPoints: 5_000,
      maxBonusCents: 20_000,
    }),
    5_000,
  );
  assert.equal(
    calculatePercentageBonusCents({
      paidAmountCents: 50_000,
      percentageBasisPoints: 5_000,
      maxBonusCents: 20_000,
    }),
    20_000,
  );
  assert.equal(
    calculatePercentageBonusCents({
      paidAmountCents: 10_001,
      percentageBasisPoints: 3_333,
      maxBonusCents: null,
    }),
    3_333,
  );
});

test("resolves launch bonus brackets", () => {
  assert.equal(resolveCouponTier(launchTiers, 3000)?.bonusCents, 500);
  assert.equal(resolveCouponTier(launchTiers, 7000)?.bonusCents, 1000);
  assert.equal(resolveCouponTier(launchTiers, 15000)?.bonusCents, 2000);
  assert.equal(resolveCouponTier(launchTiers, 2999), null);
});

test("rejects overlapping bonus brackets", () => {
  assert.equal(
    validateCouponTiers([
      { minPaidCents: 3000, maxPaidCents: 5000, bonusCents: 500 },
      { minPaidCents: 5000, maxPaidCents: null, bonusCents: 1000 },
    ]),
    "Le fasce bonus non possono sovrapporsi.",
  );
});

test("accepts ordered launch brackets", () => {
  assert.equal(validateCouponTiers(launchTiers), null);
});
