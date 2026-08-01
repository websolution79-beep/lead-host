import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultCommercialSettings,
  resolveLeadPricing,
  type CommercialSettings,
} from "@/lib/config/commercial-settings";

const settings: CommercialSettings = {
  ...defaultCommercialSettings,
  inTargetSharedLeadPriceCents: 1590,
  inTargetExclusiveLeadPriceCents: 3180,
  verifiedSharedLeadPriceCents: 1990,
  verifiedExclusiveLeadPriceCents: 3990,
  priceRules: [],
};

test("uses the in-target defaults for a non-verified owner", () => {
  const pricing = resolveLeadPricing(settings, { city: "Roma" }, false);

  assert.equal(pricing.sharedPriceCents, 1590);
  assert.equal(pricing.exclusivePriceCents, 3180);
  assert.equal(pricing.label, "Prezzo default Lead in target");
});

test("uses the verified defaults for a verified owner", () => {
  const pricing = resolveLeadPricing(settings, { city: "Roma" }, true);

  assert.equal(pricing.sharedPriceCents, 1990);
  assert.equal(pricing.exclusivePriceCents, 3990);
  assert.equal(pricing.label, "Prezzo default Lead verificato");
});

test("applies a geographic rule to both lead types", () => {
  const settingsWithRule: CommercialSettings = {
    ...settings,
    priceRules: [
      {
        id: "rome",
        scope: "city",
        value: "Roma",
        sharedPriceCents: 2500,
        exclusivePriceCents: 4500,
        active: true,
      },
    ],
  };

  const inTarget = resolveLeadPricing(
    settingsWithRule,
    { city: "Roma" },
    false,
  );
  const verified = resolveLeadPricing(
    settingsWithRule,
    { city: "Roma" },
    true,
  );

  assert.equal(inTarget.sharedPriceCents, 2500);
  assert.equal(verified.sharedPriceCents, 2500);
  assert.equal(inTarget.ruleId, "rome");
  assert.equal(verified.ruleId, "rome");
});
