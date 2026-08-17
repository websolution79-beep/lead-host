import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { isTeamCompensationEnabled } from "@/lib/team-compensation/settings";

type OutboxRow = {
  id: string;
  attempts: number;
};

type WorkerResult = {
  enabled: boolean;
  claimed: number;
  completed: number;
  failed: number;
};

export async function capturePrimeBillingCompensation(input: {
  primeBillingPeriodId: string;
  profileId: string;
  periodKind: "initial" | "renewal";
}) {
  const supabase = createServiceSupabaseClient();
  if (!(await isTeamCompensationEnabled(supabase))) return;

  const { data: period, error: periodError } = await supabase
    .from("prime_billing_periods")
    .select("id,prime_account_id,status,paid_at")
    .eq("id", input.primeBillingPeriodId)
    .eq("status", "paid")
    .maybeSingle();

  if (periodError || !period) {
    throw new Error(periodError?.message ?? "Periodo PRIME pagato non trovato.");
  }

  const { data: account, error: accountError } = await supabase
    .from("prime_accounts")
    .select("id,account_manager_member_id")
    .eq("id", period.prime_account_id)
    .maybeSingle();

  if (accountError || !account) {
    throw new Error(accountError?.message ?? "Account PRIME non trovato.");
  }

  await enqueueOutbox({
    eventType: input.periodKind === "initial"
      ? "prime_first_activation"
      : "prime_renewal",
    sourceType: "prime_billing_period",
    sourceId: period.id,
    sourceEventKey: `prime_billing:${period.id}`,
    payload: {
      member_id: account.account_manager_member_id,
      property_manager_profile_id: input.profileId,
      prime_account_id: account.id,
      prime_billing_period_id: period.id,
      period_kind: input.periodKind,
      occurred_at: period.paid_at ?? new Date().toISOString(),
    },
  });

  await runTeamCompensationWorkerSafely(10);
}

export async function capturePrimeLeadPurchaseCompensation(input: {
  purchaseId: string;
  propertyManagerId: string;
  leadId: string;
  amountCents: number;
  occurredAt?: string;
}) {
  const supabase = createServiceSupabaseClient();
  if (!(await isTeamCompensationEnabled(supabase))) return;

  const { data: propertyManager, error: pmError } = await supabase
    .from("property_manager_profiles")
    .select("profile_id")
    .eq("id", input.propertyManagerId)
    .maybeSingle();

  if (pmError || !propertyManager) {
    throw new Error(pmError?.message ?? "Property Manager non trovato.");
  }

  const { data: account, error: accountError } = await supabase
    .from("prime_accounts")
    .select("id,account_manager_member_id,status,prime_expires_at,grace_ends_at")
    .eq("profile_id", propertyManager.profile_id)
    .maybeSingle();

  if (accountError) throw new Error(accountError.message);
  if (!account || !hasPrimeAccessAt(account, new Date())) return;

  await enqueueOutbox({
    eventType: "prime_lead_purchase",
    sourceType: "lead_purchase",
    sourceId: input.purchaseId,
    sourceEventKey: `prime_lead_purchase:${input.purchaseId}`,
    payload: {
      member_id: account.account_manager_member_id,
      property_manager_profile_id: propertyManager.profile_id,
      prime_account_id: account.id,
      lead_purchase_id: input.purchaseId,
      lead_id: input.leadId,
      base_amount_cents: input.amountCents,
      occurred_at: input.occurredAt ?? new Date().toISOString(),
    },
  });

  await runTeamCompensationWorkerSafely(10);
}

export async function processTeamCompensationOutbox(
  batchSize = 25,
): Promise<WorkerResult> {
  const supabase = createServiceSupabaseClient();
  if (!(await isTeamCompensationEnabled(supabase))) {
    return { enabled: false, claimed: 0, completed: 0, failed: 0 };
  }

  const rpc = supabase as unknown as {
    rpc: (
      fn: string,
      args?: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };

  await rpc.rpc("requeue_stale_team_compensation_outbox", {});
  const claimed = await rpc.rpc("claim_team_compensation_outbox", {
    p_batch_size: Math.max(1, Math.min(batchSize, 100)),
  });
  if (claimed.error) {
    throw new Error(claimed.error.message ?? "Coda compensi non acquisita.");
  }

  const rows = (claimed.data ?? []) as OutboxRow[];
  const result: WorkerResult = {
    enabled: true,
    claimed: rows.length,
    completed: 0,
    failed: 0,
  };

  for (const row of rows) {
    const processed = await rpc.rpc("process_team_compensation_outbox_item", {
      p_outbox_id: row.id,
    });
    const outcome = processed.data as { status?: string } | null;
    if (processed.error || outcome?.status === "failed") result.failed += 1;
    else result.completed += 1;
  }

  return result;
}

export function runTeamCompensationWorkerSafely(batchSize = 25) {
  return processTeamCompensationOutbox(batchSize).catch((error) => {
    console.error(
      "Team compensation worker failed:",
      error instanceof Error ? error.message : "Errore sconosciuto.",
    );
  });
}

export async function captureTeamRefundCompensation(refundId: string) {
  const supabase = createServiceSupabaseClient();
  if (!(await isTeamCompensationEnabled(supabase))) return;

  const rpc = supabase as unknown as {
    rpc: (
      fn: "capture_team_refund_compensation",
      args: { p_refund_id: string },
    ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };
  const { error } = await rpc.rpc("capture_team_refund_compensation", {
    p_refund_id: refundId,
  });
  if (error) {
    throw new Error(error.message ?? "Storno compenso non registrato.");
  }
}

export function captureTeamRefundCompensationSafely(refundId: string) {
  return captureTeamRefundCompensation(refundId).catch((error) => {
    console.error(
      "Team refund compensation failed:",
      error instanceof Error ? error.message : "Errore sconosciuto.",
    );
  });
}

export async function reconcileTeamRefundCompensationsSafely() {
  const supabase = createServiceSupabaseClient();
  if (!(await isTeamCompensationEnabled(supabase))) return;

  const rpc = supabase as unknown as {
    rpc: (
      fn: "reconcile_team_refund_compensations",
    ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };
  const { data, error } = await rpc.rpc("reconcile_team_refund_compensations");
  if (error) {
    console.error(
      "Team refund compensation reconciliation failed:",
      error.message ?? "Errore sconosciuto.",
    );
    return;
  }
  return data;
}

async function enqueueOutbox(input: {
  eventType: string;
  sourceType: string;
  sourceId: string;
  sourceEventKey: string;
  payload: Record<string, unknown>;
}) {
  const supabase = createServiceSupabaseClient();
  const table = supabase.from("team_compensation_outbox" as never) as unknown as {
    upsert: (
      values: Record<string, unknown>,
      options: { onConflict: string; ignoreDuplicates: boolean },
    ) => Promise<{ error: { message?: string } | null }>;
  };
  const { error } = await table.upsert(
    {
      event_type: input.eventType,
      source_type: input.sourceType,
      source_id: input.sourceId,
      source_event_key: input.sourceEventKey,
      payload: input.payload,
      status: "pending",
      available_at: new Date().toISOString(),
    },
    { onConflict: "source_event_key", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message ?? "Evento compenso non accodato.");
}

function hasPrimeAccessAt(
  account: {
    status: string;
    prime_expires_at: string | null;
    grace_ends_at: string | null;
  },
  at: Date,
) {
  if (account.status === "active") {
    return !account.prime_expires_at || new Date(account.prime_expires_at) > at;
  }
  return account.status === "past_due" && Boolean(
    account.grace_ends_at && new Date(account.grace_ends_at) > at,
  );
}
