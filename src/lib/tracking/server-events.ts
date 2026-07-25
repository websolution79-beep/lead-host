import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchTrackingSettings,
  type TrackingProviderId,
} from "@/lib/config/tracking-settings";
import type { Database, Json } from "@/lib/supabase/database.types";
import { recordTrackingEventLog } from "@/lib/tracking/event-log";

type ServiceClient = SupabaseClient<Database>;

export type ServerTrackingConsentSnapshot = {
  resolved: boolean;
  measurement: boolean;
  marketing: boolean;
};

type PurchaseTrackingInput = {
  walletTransactionId: string;
  paymentId: string | null;
  stripeCheckoutSessionId: string;
  stripePaymentIntentId: string | null;
  valueCents: number;
  currency: string;
  occurredAt: string;
  consent: ServerTrackingConsentSnapshot;
};

type QueueOutcome = {
  provider: TrackingProviderId;
  status: "queued" | "duplicate" | "failed";
  logId?: string;
  error?: string;
};

export async function queuePurchaseTrackingEvent({
  supabase,
  input,
}: {
  supabase: ServiceClient;
  input: PurchaseTrackingInput;
}) {
  const { settings, storageReady } = await fetchTrackingSettings(supabase);

  if (!storageReady) {
    return {
      eventId: createPurchaseEventId(input.walletTransactionId),
      status: "skipped" as const,
      reason: "tracking_storage_unavailable",
      outcomes: [] as QueueOutcome[],
    };
  }

  const purchaseSettings = settings.events.purchase;

  if (!purchaseSettings.enabled) {
    return {
      eventId: createPurchaseEventId(input.walletTransactionId),
      status: "skipped" as const,
      reason: "event_disabled",
      outcomes: [] as QueueOutcome[],
    };
  }

  const eventId = createPurchaseEventId(input.walletTransactionId);
  const providers = purchaseSettings.providers.filter((providerId) =>
    canQueueProvider({
      providerId,
      settings,
      consent: input.consent,
    }),
  );
  const metadata = compactMetadata({
    wallet_transaction_id: input.walletTransactionId,
    payment_id: input.paymentId,
    stripe_checkout_session_id: input.stripeCheckoutSessionId,
    stripe_payment_intent_id: input.stripePaymentIntentId,
  });
  const outcomes: QueueOutcome[] = [];

  for (const provider of providers) {
    try {
      const log = await recordTrackingEventLog({
        supabase,
        input: {
          provider,
          eventName: "purchase",
          eventId,
          source: "server",
          status: "queued",
          pagePath: "/app/acquisti",
          valueCents: input.valueCents,
          currency: input.currency,
          metadata,
          occurredAt: input.occurredAt,
        },
      });

      outcomes.push({
        provider,
        status: "queued",
        logId: log.id,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        outcomes.push({ provider, status: "duplicate" });
        continue;
      }

      outcomes.push({
        provider,
        status: "failed",
        error: error instanceof Error ? error.message : "tracking_log_failed",
      });
    }
  }

  return {
    eventId,
    status: providers.length > 0 ? ("processed" as const) : ("skipped" as const),
    reason: providers.length > 0 ? null : "no_authorized_provider",
    outcomes,
  };
}

function canQueueProvider({
  providerId,
  settings,
  consent,
}: {
  providerId: TrackingProviderId;
  settings: Awaited<ReturnType<typeof fetchTrackingSettings>>["settings"];
  consent: ServerTrackingConsentSnapshot;
}) {
  const provider = settings.providers[providerId];
  const identifier =
    providerId === "meta"
      ? settings.providers.meta.pixelId
      : providerId === "ga4"
        ? settings.providers.ga4.measurementId
        : settings.providers.hotjar.siteId;
  const hasConsent =
    providerId === "meta" ? consent.marketing : consent.measurement;

  return (
    consent.resolved &&
    hasConsent &&
    provider.enabled &&
    provider.scopes.pm &&
    Boolean(identifier)
  );
}

function createPurchaseEventId(walletTransactionId: string) {
  return `purchase_${walletTransactionId}`;
}

function compactMetadata(values: Record<string, string | null>) {
  return Object.fromEntries(
    Object.entries(values).filter(
      (entry): entry is [string, string] => Boolean(entry[1]),
    ),
  ) as Record<string, Json>;
}

function isUniqueViolation(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }

  return error.code === "23505";
}
