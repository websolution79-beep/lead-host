import assert from "node:assert/strict";
import test from "node:test";
import { parseEcbUsdPerEurResponse } from "./currency";

test("legge il tasso USD per EUR dalla risposta BCE", () => {
  const result = parseEcbUsdPerEurResponse({
    dataSets: [
      {
        series: {
          "0:0:0:0:0": {
            observations: { "0": [1.1662, 0, 0, null, null] },
          },
        },
      },
    ],
    structure: {
      dimensions: {
        observation: [
          {
            id: "TIME_PERIOD",
            values: [{ id: "2026-08-25" }],
          },
        ],
      },
    },
  });

  assert.equal(result.usdPerEur, 1.1662);
  assert.equal(result.rateDate, "2026-08-25");
});

test("rifiuta una risposta BCE priva di tasso", () => {
  assert.throws(
    () =>
      parseEcbUsdPerEurResponse({
        dataSets: [{ series: {} }],
        structure: { dimensions: { observation: [] } },
      }),
    /non disponibile/,
  );
});
