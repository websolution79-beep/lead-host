import assert from "node:assert/strict";
import test from "node:test";
import { calculateRevenueEstimate } from "@/lib/financial/revenue-calculation";

test("calculates the established ADR and occupancy scenario without changing monetary rounding", () => {
  const result = calculateRevenueEstimate({
    calculationMode: "adr_occupancy",
    adrPerNight: 121,
    occupancyRate: 0.72,
    daysAvailable: 365,
    pmFeeRate: 0.2,
    airbnbMixRate: 0.7,
    bookingMixRate: 0.3,
    directMixRate: 0,
    airbnbCommissionRate: 0.15,
    bookingCommissionRate: 0.18,
    directCommissionRate: 0,
    otaVatRate: 0.22,
    pmVatRate: 0,
    taxRate: 0,
  });

  assert.equal(result.effective_ota_rate, 0.159);
  assert.equal(result.gross_annual_revenue, 31798.8);
  assert.equal(result.ota_commission_gross, 6168.33);
  assert.equal(result.pm_fee_gross, 5126.09);
  assert.equal(result.owner_annual_net, 20504.38);
  assert.equal(result.owner_monthly_net, 1708.7);
});

test("uses an explicit annual revenue input when requested", () => {
  const result = calculateRevenueEstimate({
    calculationMode: "annual_revenue",
    annualGrossRevenueInput: 12000,
    daysAvailable: 365,
    pmFeeRate: 0,
    airbnbMixRate: 1,
    bookingMixRate: 0,
    directMixRate: 0,
    airbnbCommissionRate: 0,
    bookingCommissionRate: 0,
    directCommissionRate: 0,
    otaVatRate: 0,
    pmVatRate: 0,
    taxRate: 0.1,
  });

  assert.equal(result.gross_annual_revenue, 12000);
  assert.equal(result.tax_amount, 1200);
  assert.equal(result.owner_annual_net, 10800);
  assert.equal(result.owner_monthly_net, 900);
});
