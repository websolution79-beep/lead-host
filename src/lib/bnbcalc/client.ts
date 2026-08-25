import "server-only";

import { requireEnv } from "@/lib/env";
import {
  BnbcalcApiError,
  parseBnbcalcAnalysisResponse,
  type BnbcalcAnalysisResult,
} from "@/lib/bnbcalc/response";

const BNBCALC_API_BASE_URL = "https://atlas.bnbcalc.com";
const COHOST_ANALYSIS_PATH = "/v1/external/analysis/create/cohost";
const REQUEST_TIMEOUT_MS = 30_000;

export type BnbcalcCohostInput = {
  fullAddress: string;
  bedrooms: number;
  bathrooms: number;
  accommodates: number;
};

export async function createBnbcalcCohostAnalysis(
  input: BnbcalcCohostInput,
): Promise<BnbcalcAnalysisResult> {
  const apiKey = requireEnv("BNBCALC_API_KEY");
  const normalizedInput = normalizeInput(input);
  let response: Response;

  try {
    response = await fetch(`${BNBCALC_API_BASE_URL}${COHOST_ANALYSIS_PATH}`, {
      method: "POST",
      cache: "no-store",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-bnbcalc-api-key": apiKey,
      },
      body: JSON.stringify({
        fullAddress: normalizedInput.fullAddress,
        bedrooms: normalizedInput.bedrooms,
        bathrooms: normalizedInput.bathrooms,
        // BNBCalc uses this spelling in its public API contract.
        accomodates: normalizedInput.accommodates,
        currency: "EUR",
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new BnbcalcApiError(
      error instanceof Error
        ? `BNBCalc non raggiungibile: ${error.message}`
        : "BNBCalc non raggiungibile.",
      null,
    );
  }

  const responseBody = await response.text().catch(() => "");

  if (!response.ok) {
    throw new BnbcalcApiError(
      `BNBCalc API ${response.status}: ${responseBody.slice(0, 500)}`,
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(responseBody);
  } catch {
    throw new BnbcalcApiError("BNBCalc ha restituito una risposta non valida.", response.status);
  }

  return parseBnbcalcAnalysisResponse(payload);
}

function normalizeInput(input: BnbcalcCohostInput) {
  const fullAddress = input.fullAddress.trim();

  if (!fullAddress) {
    throw new BnbcalcApiError("Inserisci l'indirizzo completo dell'immobile.", 400);
  }

  return {
    fullAddress,
    bedrooms: requireNonNegativeNumber(input.bedrooms, "numero di camere"),
    bathrooms: requireNonNegativeNumber(input.bathrooms, "numero di bagni"),
    accommodates: requirePositiveInteger(input.accommodates, "numero di posti letto"),
  };
}

function requireNonNegativeNumber(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new BnbcalcApiError(`Il ${label} non e valido.`, 400);
  }

  return value;
}

function requirePositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 1) {
    throw new BnbcalcApiError(`Il ${label} non e valido.`, 400);
  }

  return value;
}
