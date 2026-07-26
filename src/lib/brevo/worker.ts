import "server-only";
import { randomUUID } from "node:crypto";
import {
  BrevoApiError,
  type BrevoSnapshot,
  sendBrevoEvent,
  upsertBrevoContact,
} from "@/lib/brevo/client";
import {
  BREVO_MAX_ATTEMPTS,
  getBrevoConfig,
} from "@/lib/brevo/config";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

type OutboxStatus =
  | "pending"
  | "processing"
  | "retry"
  | "completed"
  | "dead_letter"
  | "cancelled";

type OutboxRow = {
  id: string;
  profile_id: string;
  event_type: string;
  event_key: string;
  payload: Record<string, unknown>;
  status: OutboxStatus;
  attempts: number;
  available_at: string;
  created_at: string;
};

type WorkerResult = {
  enabled: boolean;
  claimed: number;
  completed: number;
  retried: number;
  deadLettered: number;
  reason?: string;
};

const BREVO_BEHAVIOURAL_EVENTS = new Set([
  "user_registered",
  "first_wallet_topup",
  "wallet_recharged",
  "first_lead_purchased",
  "lead_purchased",
  "wallet_refunded",
  "account_suspended",
]);

export async function processBrevoOutbox(
  batchSize = 25,
): Promise<WorkerResult> {
  const config = getBrevoConfig();

  if (!config.enabled) {
    return {
      enabled: false,
      claimed: 0,
      completed: 0,
      retried: 0,
      deadLettered: 0,
      reason: config.reason,
    };
  }

  const supabase = createServiceSupabaseClient();
  const rpcClient = supabase as unknown as {
    rpc: (
      fn: string,
      args?: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };
  await rpcClient.rpc("requeue_stale_brevo_outbox", {});

  const workerId = `vercel:${randomUUID()}`;
  const { data, error } = await rpcClient.rpc("claim_brevo_outbox", {
    p_worker_id: workerId,
    p_batch_size: Math.max(1, Math.min(batchSize, 100)),
  });

  if (error) {
    throw new Error(error.message ?? "Impossibile acquisire la coda Brevo.");
  }

  const rows = (data ?? []) as OutboxRow[];
  const result: WorkerResult = {
    enabled: true,
    claimed: rows.length,
    completed: 0,
    retried: 0,
    deadLettered: 0,
  };
  const syncedProfiles = new Map<string, BrevoSnapshot>();

  for (const row of rows) {
    try {
      let snapshot = syncedProfiles.get(row.profile_id);
      const explicitlyRestoreMarketingPermission =
        row.event_type === "contact_sync" &&
        row.payload?.reason === "marketing_consent_changed" &&
        row.payload?.consent_status === "granted" &&
        row.payload?.source === "pm_profile_explicit";

      if (!snapshot || explicitlyRestoreMarketingPermission) {
        snapshot = await loadSnapshot(row.profile_id);
        await upsertBrevoContact(config, snapshot, {
          explicitlyRestoreMarketingPermission,
        });
        syncedProfiles.set(row.profile_id, snapshot);
      }

      if (BREVO_BEHAVIOURAL_EVENTS.has(row.event_type)) {
        await sendBrevoEvent(config, snapshot, {
          eventName: row.event_type,
          eventDate: readEventDate(row),
          eventKey: row.event_key,
          properties: await buildEventProperties(row),
        });
      }

      await updateOutboxRow(row.id, {
        status: "completed",
        processed_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
        last_error: null,
        last_http_status: null,
        updated_at: new Date().toISOString(),
      });
      result.completed += 1;
    } catch (error) {
      const failure = normalizeFailure(error);
      const deadLetter =
        row.attempts >= BREVO_MAX_ATTEMPTS || !failure.retryable;

      await updateOutboxRow(row.id, {
        status: deadLetter ? "dead_letter" : "retry",
        available_at: deadLetter
          ? row.available_at
          : new Date(
              Date.now() +
                calculateRetryDelayMs(row.attempts, failure.retryAfterMs),
            ).toISOString(),
        locked_at: null,
        locked_by: null,
        last_error: failure.message.slice(0, 2000),
        last_http_status: failure.status,
        updated_at: new Date().toISOString(),
      });

      if (deadLetter) result.deadLettered += 1;
      else result.retried += 1;
    }
  }

  return result;
}

async function loadSnapshot(profileId: string) {
  const supabase = createServiceSupabaseClient();
  const rpc = supabase as unknown as {
    rpc: (
      fn: "refresh_pm_brevo_snapshot",
      args: { p_profile_id: string },
    ) => Promise<{
      data: BrevoSnapshot | null;
      error: { message?: string } | null;
    }>;
  };
  const refreshed = await rpc.rpc("refresh_pm_brevo_snapshot", {
    p_profile_id: profileId,
  });

  if (refreshed.error) {
    throw new Error(
      refreshed.error.message ?? "Snapshot Brevo non aggiornato.",
    );
  }

  const table = supabase.from("pm_brevo_snapshots" as never) as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        single: () => Promise<{
          data: BrevoSnapshot | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };
  const { data, error } = await table
    .select("*")
    .eq("profile_id", profileId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Snapshot Brevo non disponibile.");
  }

  return data;
}

async function buildEventProperties(row: OutboxRow) {
  const payload = row.payload ?? {};
  const amountCents = readNumber(payload.amount_cents);
  const properties: Record<string, string | number | boolean | null> = {
    amount_cents: amountCents,
    amount_eur:
      amountCents === null ? null : Number((amountCents / 100).toFixed(2)),
    purchase_mode: readString(payload.purchase_mode),
    lead_id: readString(payload.lead_id),
    wallet_transaction_id: readString(payload.wallet_transaction_id),
  };

  if (
    (row.event_type === "lead_purchased" ||
      row.event_type === "first_lead_purchased") &&
    properties.lead_id
  ) {
    Object.assign(
      properties,
      await loadLeadEventContext(String(properties.lead_id)),
    );
  }

  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== null),
  );
}

async function loadLeadEventContext(leadId: string) {
  const supabase = createServiceSupabaseClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("property_id")
    .eq("id", leadId)
    .maybeSingle();

  if (!lead?.property_id) return {};

  const { data: property } = await supabase
    .from("properties")
    .select("city,province,property_type")
    .eq("id", lead.property_id)
    .maybeSingle();

  return {
    lead_city: property?.city ?? null,
    lead_province: property?.province ?? null,
    opportunity_type: property?.property_type ?? null,
  };
}

async function updateOutboxRow(
  id: string,
  patch: Record<string, unknown>,
) {
  const supabase = createServiceSupabaseClient();
  const table = supabase.from("brevo_outbox" as never) as unknown as {
    update: (values: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string,
      ) => Promise<{ error: { message?: string } | null }>;
    };
  };
  const { error } = await table.update(patch).eq("id", id);

  if (error) {
    throw new Error(error.message ?? "Stato outbox Brevo non aggiornato.");
  }
}

function readEventDate(row: OutboxRow) {
  const occurredAt = readString(row.payload?.occurred_at);
  return occurredAt && !Number.isNaN(Date.parse(occurredAt))
    ? occurredAt
    : row.created_at;
}

function readString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeFailure(error: unknown) {
  if (error instanceof BrevoApiError) {
    return {
      message: error.message,
      status: error.status,
      retryAfterMs: error.retryAfterMs,
      retryable: error.retryable,
    };
  }

  return {
    message: error instanceof Error ? error.message : "Errore worker Brevo.",
    status: null,
    retryAfterMs: null,
    retryable: true,
  };
}

function calculateRetryDelayMs(
  attempts: number,
  retryAfterMs: number | null,
) {
  if (retryAfterMs !== null) {
    return Math.min(Math.max(retryAfterMs, 30_000), 24 * 60 * 60 * 1000);
  }

  const exponential = 30_000 * 2 ** Math.max(0, attempts - 1);
  const jitter = Math.floor(Math.random() * 10_000);
  return Math.min(exponential + jitter, 6 * 60 * 60 * 1000);
}

export function runBrevoWorkerSafely(batchSize = 25) {
  return processBrevoOutbox(batchSize).catch((error) => {
    console.error(
      "Brevo outbox worker failed:",
      error instanceof Error ? error.message : "Errore sconosciuto.",
    );
  });
}
