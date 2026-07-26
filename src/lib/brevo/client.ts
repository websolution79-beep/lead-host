import "server-only";
import {
  BREVO_ATTRIBUTE_NAMES,
  type BrevoConfig,
} from "@/lib/brevo/config";

const BREVO_API_BASE_URL = "https://api.brevo.com/v3";
const REQUEST_TIMEOUT_MS = 12_000;

export type BrevoSnapshot = {
  profile_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  registered_at: string;
  last_access_at: string | null;
  account_status: string;
  marketing_consent_status: "granted" | "not_granted" | "withdrawn";
  marketing_consent_updated_at: string;
  wallet_balance_cents: number;
  has_wallet_topup: boolean;
  first_wallet_topup_at: string | null;
  last_wallet_topup_at: string | null;
  wallet_topups_count: number;
  wallet_topups_total_cents: number;
  lead_purchases_count: number;
  first_lead_purchase_at: string | null;
  last_lead_purchase_at: string | null;
  lead_spend_gross_cents: number;
  wallet_refunds_total_cents: number;
  lead_spend_net_cents: number;
  lifecycle_status: string;
  updated_at: string;
};

export type BrevoEventInput = {
  eventName: string;
  eventDate: string;
  eventKey: string;
  properties?: Record<string, string | number | boolean | null>;
};

export class BrevoApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly retryAfterMs: number | null,
  ) {
    super(message);
    this.name = "BrevoApiError";
  }

  get retryable() {
    return (
      this.status === null ||
      this.status === 408 ||
      this.status === 425 ||
      this.status === 429 ||
      this.status >= 500
    );
  }
}

export async function upsertBrevoContact(
  config: Extract<BrevoConfig, { enabled: true }>,
  snapshot: BrevoSnapshot,
  options: {
    explicitlyRestoreMarketingPermission?: boolean;
  } = {},
) {
  const attributes = {
    [BREVO_ATTRIBUTE_NAMES.firstName]: snapshot.first_name ?? "",
    [BREVO_ATTRIBUTE_NAMES.lastName]: snapshot.last_name ?? "",
    [BREVO_ATTRIBUTE_NAMES.registeredAt]: toBrevoDate(snapshot.registered_at),
    [BREVO_ATTRIBUTE_NAMES.lastAccessAt]: toBrevoDate(snapshot.last_access_at),
    [BREVO_ATTRIBUTE_NAMES.accountStatus]: snapshot.account_status,
    [BREVO_ATTRIBUTE_NAMES.marketingConsent]:
      snapshot.marketing_consent_status === "granted",
    [BREVO_ATTRIBUTE_NAMES.marketingConsentStatus]:
      snapshot.marketing_consent_status,
    [BREVO_ATTRIBUTE_NAMES.walletBalance]: centsToEuros(
      snapshot.wallet_balance_cents,
    ),
    [BREVO_ATTRIBUTE_NAMES.hasWalletTopup]: snapshot.has_wallet_topup,
    [BREVO_ATTRIBUTE_NAMES.firstWalletTopupAt]: toBrevoDate(
      snapshot.first_wallet_topup_at,
    ),
    [BREVO_ATTRIBUTE_NAMES.lastWalletTopupAt]: toBrevoDate(
      snapshot.last_wallet_topup_at,
    ),
    [BREVO_ATTRIBUTE_NAMES.walletTopupsCount]: snapshot.wallet_topups_count,
    [BREVO_ATTRIBUTE_NAMES.walletTopupsTotal]: centsToEuros(
      snapshot.wallet_topups_total_cents,
    ),
    [BREVO_ATTRIBUTE_NAMES.leadPurchasesCount]: snapshot.lead_purchases_count,
    [BREVO_ATTRIBUTE_NAMES.firstLeadPurchaseAt]: toBrevoDate(
      snapshot.first_lead_purchase_at,
    ),
    [BREVO_ATTRIBUTE_NAMES.lastLeadPurchaseAt]: toBrevoDate(
      snapshot.last_lead_purchase_at,
    ),
    [BREVO_ATTRIBUTE_NAMES.leadSpendGross]: centsToEuros(
      snapshot.lead_spend_gross_cents,
    ),
    [BREVO_ATTRIBUTE_NAMES.walletRefundsTotal]: centsToEuros(
      snapshot.wallet_refunds_total_cents,
    ),
    [BREVO_ATTRIBUTE_NAMES.leadSpendNet]: centsToEuros(
      snapshot.lead_spend_net_cents,
    ),
    [BREVO_ATTRIBUTE_NAMES.lifecycleStatus]: snapshot.lifecycle_status,
  };

  await brevoRequest(config, "/contacts", {
    method: "POST",
    body: JSON.stringify({
      email: snapshot.email,
      ext_id: snapshot.profile_id,
      attributes: removeUndefinedValues(attributes),
      listIds: [config.listId],
      updateEnabled: true,
      getId: true,
      ...(options.explicitlyRestoreMarketingPermission
        ? { emailBlacklisted: false }
        : {}),
    }),
  });
}

export async function sendBrevoEvent(
  config: Extract<BrevoConfig, { enabled: true }>,
  snapshot: BrevoSnapshot,
  event: BrevoEventInput,
) {
  await brevoRequest(config, "/events", {
    method: "POST",
    body: JSON.stringify({
      event_name: event.eventName,
      event_date: event.eventDate,
      identifiers: {
        ext_id: snapshot.profile_id,
      },
      event_properties: removeUndefinedValues({
        integration_event_key: event.eventKey,
        ...event.properties,
      }),
    }),
  });
}

async function brevoRequest(
  config: Extract<BrevoConfig, { enabled: true }>,
  path: string,
  init: RequestInit,
) {
  let response: Response;

  try {
    response = await fetch(`${BREVO_API_BASE_URL}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        accept: "application/json",
        "api-key": config.apiKey,
        "content-type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new BrevoApiError(
      error instanceof Error ? error.message : "Brevo non raggiungibile.",
      null,
      null,
    );
  }

  if (response.ok) return;

  const responseBody = await response.text().catch(() => "");
  throw new BrevoApiError(
    `Brevo API ${response.status}: ${responseBody.slice(0, 500)}`,
    response.status,
    readRetryAfterMs(response.headers),
  );
}

function readRetryAfterMs(headers: Headers) {
  const retryAfter = headers.get("retry-after");
  const rateLimitReset = headers.get("x-sib-ratelimit-reset");
  const rawValue = retryAfter ?? rateLimitReset;

  if (!rawValue) return null;

  const seconds = Number(rawValue);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const dateValue = Date.parse(rawValue);
  return Number.isNaN(dateValue) ? null : Math.max(0, dateValue - Date.now());
}

function toBrevoDate(value: string | null) {
  return value ? value.slice(0, 10) : undefined;
}

function centsToEuros(value: number) {
  return Number((value / 100).toFixed(2));
}

function removeUndefinedValues<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}
