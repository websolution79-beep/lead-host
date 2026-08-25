import { z } from "zod";
import { BnbcalcApiError } from "@/lib/bnbcalc/response";

const ECB_USD_RATE_URL =
  "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=jsondata&lastNObservations=1";
const REQUEST_TIMEOUT_MS = 10_000;

const ecbResponseSchema = z.object({
  dataSets: z.array(
    z.object({
      series: z.record(
        z.string(),
        z.object({
          observations: z.record(z.string(), z.array(z.unknown())),
        }),
      ),
    }),
  ),
  structure: z.object({
    dimensions: z.object({
      observation: z.array(
        z.object({
          id: z.string(),
          values: z.array(z.object({ id: z.string() }).passthrough()),
        }),
      ),
    }),
  }),
});

export type EurConversion = {
  amountEur: number;
  conversionRate: number;
  rateDate: string | null;
};

export async function convertAmountToEur(
  amount: number,
  sourceCurrency: string,
): Promise<EurConversion> {
  const currency = sourceCurrency.trim().toUpperCase();

  if (currency === "EUR") {
    return {
      amountEur: roundMoney(amount),
      conversionRate: 1,
      rateDate: null,
    };
  }

  if (currency !== "USD") {
    throw new BnbcalcApiError(
      `La valuta ${currency} restituita da BNBCalc non e supportata.`,
      502,
    );
  }

  let response: Response;
  try {
    response = await fetch(ECB_USD_RATE_URL, {
      headers: { accept: "application/json" },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new BnbcalcApiError(
      error instanceof Error
        ? `Tasso EUR/USD non disponibile: ${error.message}`
        : "Tasso EUR/USD non disponibile.",
      502,
    );
  }

  if (!response.ok) {
    throw new BnbcalcApiError(
      `Servizio cambi BCE non disponibile (${response.status}).`,
      502,
    );
  }

  const rate = parseEcbUsdPerEurResponse(await response.json());
  const usdToEur = 1 / rate.usdPerEur;

  return {
    amountEur: roundMoney(amount * usdToEur),
    conversionRate: usdToEur,
    rateDate: rate.rateDate,
  };
}

export function parseEcbUsdPerEurResponse(payload: unknown) {
  const parsed = ecbResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new BnbcalcApiError("Risposta del servizio cambi BCE non valida.", 502);
  }

  const firstSeries = Object.values(parsed.data.dataSets[0]?.series ?? {})[0];
  const firstObservation = Object.values(firstSeries?.observations ?? {})[0];
  const usdPerEur = Number(firstObservation?.[0]);
  const timeDimension = parsed.data.structure.dimensions.observation.find(
    (dimension) => dimension.id === "TIME_PERIOD",
  );
  const rateDate = timeDimension?.values[0]?.id ?? null;

  if (!Number.isFinite(usdPerEur) || usdPerEur <= 0) {
    throw new BnbcalcApiError("Tasso EUR/USD BCE non disponibile.", 502);
  }

  return { usdPerEur, rateDate };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
