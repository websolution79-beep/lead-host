import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchTrackingSettings,
  type TrackingEventId,
  type TrackingProviderId,
} from "@/lib/config/tracking-settings";
import type { TrackingScopeId } from "@/lib/tracking/consent";
import { appUrl } from "@/lib/env";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  findTrackingEventLog,
  recordTrackingEventLog,
  updateTrackingEventLogStatus,
} from "@/lib/tracking/event-log";
import {
  sendMetaConversionEvent,
  type MetaConversionEventInput,
} from "@/lib/tracking/meta-conversions-api";

type ServiceClient = SupabaseClient<Database>;

export type ServerTrackingConsentSnapshot = {
  resolved: boolean;
  measurement: boolean;
  marketing: boolean;
};

type TrackingUser = MetaConversionEventInput["user"];

type PurchaseTrackingInput = {
  profileId: string;
  walletTransactionId: string;
  paymentId: string | null;
  stripeCheckoutSessionId: string;
  stripePaymentIntentId: string | null;
  valueCents: number;
  currency: string;
  occurredAt: string;
  consent: ServerTrackingConsentSnapshot;
};

type HybridTrackingInput = {
  eventName: Extract<TrackingEventId, "lead" | "complete_registration">;
  eventId: string;
  pagePath: string;
  occurredAt: string;
  consent: ServerTrackingConsentSnapshot;
  user: TrackingUser;
};

type QueueOutcome = {
  provider: TrackingProviderId;
  status: "queued" | "sent" | "duplicate" | "failed" | "skipped";
  logId?: string;
  error?: string;
};

export function createServerTrackingEventId(
  eventName: "lead" | "complete_registration",
  reference: string,
) {
  const digest = createHash("sha256")
    .update(`${eventName}:${reference}`)
    .digest("hex")
    .slice(0, 40);

  return `${eventName}_${digest}`;
}

export async function trackMetaHybridEvent({
  supabase,
  input,
}: {
  supabase: ServiceClient;
  input: HybridTrackingInput;
}) {
  const { settings, storageReady } = await fetchTrackingSettings(supabase);

  if (!storageReady) {
    return skippedResult(input.eventId, "tracking_storage_unavailable");
  }

  const outcome = await processMetaEvent({
    supabase,
    settings,
    eventName: input.eventName,
    metaEventName:
      input.eventName === "lead" ? "Lead" : "CompleteRegistration",
    eventId: input.eventId,
    source: "hybrid",
    scope: "public",
    pagePath: input.pagePath,
    occurredAt: input.occurredAt,
    consent: input.consent,
    user: input.user,
    metadata: {},
  });

  return {
    eventId: input.eventId,
    status: outcome.status,
    reason: outcome.status === "skipped" ? outcome.error ?? "not_authorized" : null,
    outcomes: [outcome],
  };
}

export async function queuePurchaseTrackingEvent({
  supabase,
  input,
}: {
  supabase: ServiceClient;
  input: PurchaseTrackingInput;
}) {
  const { settings, storageReady } = await fetchTrackingSettings(supabase);
  const eventId = createPurchaseEventId(input.walletTransactionId);

  if (!storageReady) {
    return skippedResult(eventId, "tracking_storage_unavailable");
  }

  const purchaseSettings = settings.events.purchase;

  if (!purchaseSettings.enabled) {
    return skippedResult(eventId, "event_disabled");
  }

  const metadata = compactMetadata({
    wallet_transaction_id: input.walletTransactionId,
    payment_id: input.paymentId,
    stripe_checkout_session_id: input.stripeCheckoutSessionId,
    stripe_payment_intent_id: input.stripePaymentIntentId,
  });
  const outcomes: QueueOutcome[] = [];
  const user = purchaseSettings.providers.includes("meta")
    ? await fetchTrackingUser(supabase, input.profileId)
    : null;

  for (const provider of purchaseSettings.providers) {
    if (provider === "meta") {
      if (!user) {
        outcomes.push({
          provider,
          status: "failed",
          error: "tracking_profile_not_found",
        });
        continue;
      }

      outcomes.push(
        await processMetaEvent({
          supabase,
          settings,
          eventName: "purchase",
          metaEventName: "Purchase",
          eventId,
          source: "server",
          scope: "pm",
          pagePath: "/app/acquisti",
          occurredAt: input.occurredAt,
          consent: input.consent,
          user,
          metadata,
          customData: {
            valueCents: input.valueCents,
            currency: input.currency,
          },
        }),
      );
      continue;
    }

    if (
      !canUseProvider({
        providerId: provider,
        settings,
        scope: "pm",
        consent: input.consent,
      })
    ) {
      outcomes.push({ provider, status: "skipped" });
      continue;
    }

    outcomes.push(
      await queueProviderEvent({
        supabase,
        provider,
        eventName: "purchase",
        eventId,
        source: "server",
        pagePath: "/app/acquisti",
        valueCents: input.valueCents,
        currency: input.currency,
        metadata,
        occurredAt: input.occurredAt,
      }),
    );
  }

  return {
    eventId,
    status: "processed" as const,
    reason: null,
    outcomes,
  };
}

async function processMetaEvent({
  supabase,
  settings,
  eventName,
  metaEventName,
  eventId,
  source,
  scope,
  pagePath,
  occurredAt,
  consent,
  user,
  metadata,
  customData,
}: {
  supabase: ServiceClient;
  settings: Awaited<ReturnType<typeof fetchTrackingSettings>>["settings"];
  eventName: TrackingEventId;
  metaEventName: string;
  eventId: string;
  source: "server" | "hybrid";
  scope: TrackingScopeId;
  pagePath: string;
  occurredAt: string;
  consent: ServerTrackingConsentSnapshot;
  user: TrackingUser;
  metadata: Record<string, Json>;
  customData?: MetaConversionEventInput["customData"];
}): Promise<QueueOutcome> {
  const eventSettings = settings.events[eventName];

  if (
    !eventSettings.enabled ||
    !eventSettings.providers.includes("meta") ||
    !canUseProvider({
      providerId: "meta",
      settings,
      scope,
      consent,
    })
  ) {
    return { provider: "meta", status: "skipped" };
  }

  const log = await getOrCreateTrackingLog({
    supabase,
    provider: "meta",
    eventName,
    eventId,
    source,
    pagePath,
    valueCents: customData?.valueCents,
    currency: customData?.currency,
    metadata,
    occurredAt,
  });

  if (!log) {
    return {
      provider: "meta",
      status: "failed",
      error: "tracking_log_failed",
    };
  }

  if (log.status === "sent") {
    return { provider: "meta", status: "duplicate", logId: log.id };
  }

  try {
    const result = await sendMetaConversionEvent({
      pixelId: settings.providers.meta.pixelId,
      eventName: metaEventName,
      eventId,
      eventTime: occurredAt,
      eventSourceUrl: `${appUrl.replace(/\/$/, "")}${pagePath}`,
      user,
      customData,
    });

    if (result.eventsReceived < 1) {
      throw new Error("Meta non ha confermato la ricezione dell'evento.");
    }

    await updateTrackingEventLogStatus({
      supabase,
      logId: log.id,
      status: "sent",
    });

    return { provider: "meta", status: "sent", logId: log.id };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "meta_conversion_failed";

    await updateTrackingEventLogStatus({
      supabase,
      logId: log.id,
      status: "failed",
      errorMessage: message,
    }).catch(() => null);

    return {
      provider: "meta",
      status: "failed",
      logId: log.id,
      error: message,
    };
  }
}

async function queueProviderEvent({
  supabase,
  provider,
  eventName,
  eventId,
  source,
  pagePath,
  valueCents,
  currency,
  metadata,
  occurredAt,
}: {
  supabase: ServiceClient;
  provider: TrackingProviderId;
  eventName: TrackingEventId;
  eventId: string;
  source: "server" | "hybrid";
  pagePath: string;
  valueCents?: number | null;
  currency?: string | null;
  metadata: Record<string, Json>;
  occurredAt: string;
}): Promise<QueueOutcome> {
  const log = await getOrCreateTrackingLog({
    supabase,
    provider,
    eventName,
    eventId,
    source,
    pagePath,
    valueCents,
    currency,
    metadata,
    occurredAt,
  });

  if (!log) {
    return { provider, status: "failed", error: "tracking_log_failed" };
  }

  return {
    provider,
    status: log.status === "sent" ? "duplicate" : "queued",
    logId: log.id,
  };
}

async function getOrCreateTrackingLog({
  supabase,
  provider,
  eventName,
  eventId,
  source,
  pagePath,
  valueCents,
  currency,
  metadata,
  occurredAt,
}: {
  supabase: ServiceClient;
  provider: TrackingProviderId;
  eventName: TrackingEventId;
  eventId: string;
  source: "server" | "hybrid";
  pagePath: string;
  valueCents?: number | null;
  currency?: string | null;
  metadata: Record<string, Json>;
  occurredAt: string;
}) {
  try {
    return await recordTrackingEventLog({
      supabase,
      input: {
        provider,
        eventName,
        eventId,
        source,
        status: "queued",
        pagePath,
        valueCents,
        currency,
        metadata,
        occurredAt,
      },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) return null;

    return findTrackingEventLog({
      supabase,
      provider,
      eventId,
    }).catch(() => null);
  }
}

async function fetchTrackingUser(
  supabase: ServiceClient,
  profileId: string,
): Promise<TrackingUser | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,phone")
    .eq("id", profileId)
    .maybeSingle();

  if (error || !data?.email) return null;

  return {
    profileId: data.id,
    email: data.email,
    phone: data.phone,
  };
}

function canUseProvider({
  providerId,
  settings,
  scope,
  consent,
}: {
  providerId: TrackingProviderId;
  settings: Awaited<ReturnType<typeof fetchTrackingSettings>>["settings"];
  scope: TrackingScopeId;
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
    provider.scopes[scope] &&
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

function skippedResult(eventId: string, reason: string) {
  return {
    eventId,
    status: "skipped" as const,
    reason,
    outcomes: [] as QueueOutcome[],
  };
}

function isUniqueViolation(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }

  return error.code === "23505";
}
