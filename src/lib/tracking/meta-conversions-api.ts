import { createHash } from "crypto";
import { getEnv } from "@/lib/env";

const DEFAULT_META_GRAPH_API_VERSION = "v25.0";
const META_REQUEST_TIMEOUT_MS = 10_000;
const META_MAX_ATTEMPTS = 3;

export type MetaConversionEventInput = {
  pixelId: string;
  eventName: string;
  eventId: string;
  eventTime: string;
  eventSourceUrl: string;
  user: {
    profileId: string;
    email: string;
    phone?: string | null;
  };
  customData?: {
    valueCents?: number | null;
    currency?: string | null;
  };
};

type MetaConversionsApiResponse = {
  events_received?: number;
  fbtrace_id?: string;
  messages?: string[];
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
};

export class MetaConversionsApiError extends Error {
  status: number | null;
  code: number | null;

  constructor(message: string, status: number | null, code: number | null) {
    super(message);
    this.name = "MetaConversionsApiError";
    this.status = status;
    this.code = code;
  }
}

export function isMetaConversionsApiConfigured() {
  return Boolean(getEnv("META_CONVERSIONS_API_TOKEN"));
}

export function getMetaGraphApiVersion() {
  const configured = getEnv("META_GRAPH_API_VERSION")?.trim();

  return configured && /^v\d+\.\d+$/.test(configured)
    ? configured
    : DEFAULT_META_GRAPH_API_VERSION;
}

export function buildMetaConversionEvent(input: MetaConversionEventInput) {
  const customData =
    input.customData?.valueCents !== null &&
    input.customData?.valueCents !== undefined &&
    input.customData.currency
      ? {
          value: Math.max(0, Math.round(input.customData.valueCents)) / 100,
          currency: normalizeCurrency(input.customData.currency),
        }
      : undefined;

  return {
    event_name: input.eventName,
    event_time: Math.floor(new Date(input.eventTime).getTime() / 1000),
    event_id: input.eventId,
    action_source: "website",
    event_source_url: input.eventSourceUrl,
    user_data: buildHashedUserData(input.user),
    ...(customData ? { custom_data: customData } : {}),
  };
}

export async function sendMetaConversionEvent(
  input: MetaConversionEventInput,
) {
  const accessToken = getEnv("META_CONVERSIONS_API_TOKEN");

  if (!accessToken) {
    throw new MetaConversionsApiError(
      "Token Meta Conversions API non configurato.",
      null,
      null,
    );
  }

  const version = getMetaGraphApiVersion();
  const endpoint = `https://graph.facebook.com/${version}/${encodeURIComponent(input.pixelId)}/events`;
  const requestBody = JSON.stringify({
    data: [buildMetaConversionEvent(input)],
    access_token: accessToken,
  });
  let lastError: MetaConversionsApiError | null = null;

  for (let attempt = 1; attempt <= META_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: requestBody,
        signal: AbortSignal.timeout(META_REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as
        MetaConversionsApiResponse;

      if (!response.ok || payload.error) {
        const error = new MetaConversionsApiError(
          payload.error?.message ?? "Meta Conversions API non disponibile.",
          response.status,
          payload.error?.code ?? null,
        );

        if (!shouldRetry(error) || attempt === META_MAX_ATTEMPTS) {
          throw error;
        }

        lastError = error;
      } else {
        return {
          eventsReceived: payload.events_received ?? 0,
          traceId: payload.fbtrace_id ?? null,
          messages: payload.messages ?? [],
          graphApiVersion: version,
        };
      }
    } catch (error) {
      const normalized =
        error instanceof MetaConversionsApiError
          ? error
          : new MetaConversionsApiError(
              error instanceof Error
                ? error.message
                : "Meta Conversions API non raggiungibile.",
              null,
              null,
            );

      if (!shouldRetry(normalized) || attempt === META_MAX_ATTEMPTS) {
        throw normalized;
      }

      lastError = normalized;
    }

    await wait(attempt * 250);
  }

  throw (
    lastError ??
    new MetaConversionsApiError(
      "Meta Conversions API non disponibile.",
      null,
      null,
    )
  );
}

function buildHashedUserData(user: MetaConversionEventInput["user"]) {
  const email = normalizeEmail(user.email);
  const phone = normalizePhone(user.phone);

  return {
    em: [sha256(email)],
    external_id: [sha256(user.profileId.trim().toLowerCase())],
    ...(phone ? { ph: [sha256(phone)] } : {}),
    country: [sha256("it")],
  };
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string | null | undefined) {
  if (!value) return null;

  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (!digits.startsWith("39") && digits.length >= 9 && digits.length <= 11) {
    digits = `39${digits}`;
  }

  return digits.length >= 8 ? digits : null;
}

function normalizeCurrency(value: string) {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : "EUR";
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function shouldRetry(error: MetaConversionsApiError) {
  return error.status === null || error.status === 429 || error.status >= 500;
}

function wait(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
