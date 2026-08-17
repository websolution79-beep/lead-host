import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultTeamCompensationSettings,
  normalizeTeamCompensationSettings,
} from "./settings";

test("maps valid team compensation settings", () => {
  assert.deepEqual(
    normalizeTeamCompensationSettings({
        feature_enabled: true,
        lead_verification_cents: 350,
        prime_first_activation_cents: 5_500,
        prime_renewal_cents: 2_500,
        prime_lead_purchase_basis_points: 1_250,
        currency: "EUR",
    }),
    {
      featureEnabled: true,
      leadVerificationCents: 350,
      primeFirstActivationCents: 5_500,
      primeRenewalCents: 2_500,
      primeLeadPurchaseBasisPoints: 1_250,
      currency: "EUR",
    },
  );
});

test("falls back for invalid team compensation settings", () => {
  assert.deepEqual(
    normalizeTeamCompensationSettings({
        feature_enabled: null,
        lead_verification_cents: -1,
        prime_first_activation_cents: 1.5,
        prime_renewal_cents: null,
        prime_lead_purchase_basis_points: 10_001,
        currency: "USD",
    }),
    defaultTeamCompensationSettings,
  );
});
