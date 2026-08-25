import assert from "node:assert/strict";
import test from "node:test";
import { parseBnbcalcAnalysisResponse } from "./response";

test("normalizza una risposta BNBCalc in EUR", () => {
  const result = parseBnbcalcAnalysisResponse({
    success: true,
    data: {
      _id: "analysis-eur",
      url: "https://www.bnbcalc.com/analysis/example/analysis-eur",
      currency: "eur",
      fullAddress: "Via Roma 10, Roma",
      adr: { avg: 142.5 },
      occupancy: { avg: 0.68 },
    },
  });

  assert.equal(result.sourceCurrency, "EUR");
  assert.equal(result.adr, 142.5);
  assert.equal(result.occupancyPercentage, 68);
  assert.equal(result.requiresEurConversion, false);
});

test("segnala una risposta USD da convertire prima del salvataggio", () => {
  const result = parseBnbcalcAnalysisResponse({
    success: true,
    data: {
      _id: "analysis-usd",
      currency: "USD",
      ratePerNightUSD: 160,
      occupancyRatePercentage: 72,
    },
  });

  assert.equal(result.sourceCurrency, "USD");
  assert.equal(result.adr, 160);
  assert.equal(result.occupancyPercentage, 72);
  assert.equal(result.requiresEurConversion, true);
});

test("rifiuta una risposta senza metriche sufficienti", () => {
  assert.throws(
    () =>
      parseBnbcalcAnalysisResponse({
        success: true,
        data: {
          _id: "analysis-invalid",
          currency: "EUR",
        },
      }),
    /non contiene ADR e occupazione medi/,
  );
});
