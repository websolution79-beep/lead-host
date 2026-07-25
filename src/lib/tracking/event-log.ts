import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type {
  TrackingEventId,
  TrackingProviderId,
} from "@/lib/config/tracking-settings";

type ServiceClient = SupabaseClient<Database>;

export type TrackingEventLogInput = {
  provider: TrackingProviderId;
  eventName: TrackingEventId;
  eventId?: string | null;
  source: "browser" | "server" | "hybrid" | "test";
  status: "queued" | "sent" | "failed" | "skipped";
  pagePath?: string | null;
  valueCents?: number | null;
  currency?: string | null;
  metadata?: Record<string, Json>;
  errorMessage?: string | null;
  occurredAt?: string;
  sentAt?: string | null;
};

const prohibitedMetadataKeys = new Set([
  "address",
  "email",
  "first_name",
  "full_name",
  "ip",
  "last_name",
  "name",
  "phone",
  "precise_address",
  "user_agent",
]);

export async function recordTrackingEventLog({
  supabase,
  input,
}: {
  supabase: ServiceClient;
  input: TrackingEventLogInput;
}) {
  const metadata = sanitizeMetadata(input.metadata ?? {});
  const { data, error } = await supabase
    .from("tracking_event_logs")
    .insert({
      provider: input.provider,
      event_name: input.eventName,
      event_id: normalizeOptionalText(input.eventId, 160),
      source: input.source,
      status: input.status,
      page_path: normalizePagePath(input.pagePath),
      value_cents:
        input.valueCents === null || input.valueCents === undefined
          ? null
          : Math.max(0, Math.round(input.valueCents)),
      currency: normalizeCurrency(input.currency),
      metadata,
      error_message: normalizeOptionalText(input.errorMessage, 2000),
      occurred_at: input.occurredAt ?? new Date().toISOString(),
      sent_at: input.sentAt ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;

  return data;
}

function sanitizeMetadata(metadata: Record<string, Json>) {
  const entries = Object.entries(metadata).slice(0, 40);
  const sanitized: Record<string, Json> = {};

  for (const [key, value] of entries) {
    if (prohibitedMetadataKeys.has(key.toLowerCase())) {
      throw new Error(`Il campo metadata "${key}" non è consentito nei log tracking.`);
    }

    sanitized[key.slice(0, 80)] = sanitizeMetadataValue(value);
  }

  return sanitized;
}

function sanitizeMetadataValue(value: Json): Json {
  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => sanitizeMetadataValue(item));
  }

  if (value && typeof value === "object") {
    return sanitizeMetadata(value as Record<string, Json>);
  }

  return typeof value === "string" ? value.slice(0, 500) : value;
}

function normalizePagePath(value: string | null | undefined) {
  const cleanValue = normalizeOptionalText(value, 500);

  return cleanValue?.split(/[?#]/, 1)[0] ?? null;
}

function normalizeCurrency(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase();

  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function normalizeOptionalText(
  value: string | null | undefined,
  maxLength: number,
) {
  const normalized = value?.trim();

  return normalized ? normalized.slice(0, maxLength) : null;
}
