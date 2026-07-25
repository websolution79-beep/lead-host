import { createHash } from "crypto";
import { getEnv } from "@/lib/env";

const GA4_REQUEST_TIMEOUT_MS = 10_000;
const GA4_MAX_ATTEMPTS = 3;

export type Ga4PurchaseEventInput = {
  measurementId: string;
  clientId?: string | null;
  profileId: string;
  eventId: string;
  transactionId: string;
  valueCents: number;
  currency: string;
  occurredAt: string;
};

export class Ga4MeasurementProtocolError extends Error {
  status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "Ga4MeasurementProtocolError";
    this.status = status;
  }
}

export function isGa4MeasurementProtocolConfigured() {
  return Boolean(getEnv("GA4_MEASUREMENT_PROTOCOL_SECRET"));
}

export function buildGa4PurchasePayload(input: Ga4PurchaseEventInput) {
  return {
    client_id:
      normalizeClientId(input.clientId) ??
      createFallbackGa4ClientId(input.profileId),
    user_id: createHash("sha256").update(input.profileId).digest("hex"),
    timestamp_micros: new Date(input.occurredAt).getTime() * 1000,
    non_personalized_ads: true,
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: input.transactionId,
          value: Math.max(0, Math.round(input.valueCents)) / 100,
          currency: normalizeCurrency(input.currency),
          event_id: input.eventId,
          engagement_time_msec: 1,
          items: [
            {
              item_id: "wallet_top_up",
              item_name: "Ricarica wallet Lead Host",
              price: Math.max(0, Math.round(input.valueCents)) / 100,
              quantity: 1,
            },
          ],
        },
      },
    ],
  };
}

export async function sendGa4PurchaseEvent(input: Ga4PurchaseEventInput) {
  const apiSecret = getEnv("GA4_MEASUREMENT_PROTOCOL_SECRET");

  if (!apiSecret) {
    throw new Ga4MeasurementProtocolError(
      "Secret GA4 Measurement Protocol non configurato.",
      null,
    );
  }

  const endpoint = new URL("https://www.google-analytics.com/mp/collect");
  endpoint.searchParams.set("measurement_id", input.measurementId);
  endpoint.searchParams.set("api_secret", apiSecret);
  const requestBody = JSON.stringify(buildGa4PurchasePayload(input));
  let lastError: Ga4MeasurementProtocolError | null = null;

  for (let attempt = 1; attempt <= GA4_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: requestBody,
        signal: AbortSignal.timeout(GA4_REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });

      if (!response.ok) {
        const error = new Ga4MeasurementProtocolError(
          `GA4 Measurement Protocol non disponibile (${response.status}).`,
          response.status,
        );

        if (!shouldRetry(error) || attempt === GA4_MAX_ATTEMPTS) {
          throw error;
        }

        lastError = error;
      } else {
        return {
          accepted: true,
          status: response.status,
        };
      }
    } catch (error) {
      const normalized =
        error instanceof Ga4MeasurementProtocolError
          ? error
          : new Ga4MeasurementProtocolError(
              error instanceof Error
                ? error.message
                : "GA4 Measurement Protocol non raggiungibile.",
              null,
            );

      if (!shouldRetry(normalized) || attempt === GA4_MAX_ATTEMPTS) {
        throw normalized;
      }

      lastError = normalized;
    }

    await wait(attempt * 250);
  }

  throw (
    lastError ??
    new Ga4MeasurementProtocolError(
      "GA4 Measurement Protocol non disponibile.",
      null,
    )
  );
}

export function createFallbackGa4ClientId(profileId: string) {
  const digest = createHash("sha256").update(profileId).digest("hex");
  const first = BigInt(`0x${digest.slice(0, 13)}`).toString(10);
  const second = BigInt(`0x${digest.slice(13, 26)}`).toString(10);
  return `${first}.${second}`;
}

function normalizeClientId(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized && /^[A-Za-z0-9._-]{1,128}$/.test(normalized)
    ? normalized
    : null;
}

function normalizeCurrency(value: string) {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : "EUR";
}

function shouldRetry(error: Ga4MeasurementProtocolError) {
  return error.status === null || error.status === 429 || error.status >= 500;
}

function wait(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
