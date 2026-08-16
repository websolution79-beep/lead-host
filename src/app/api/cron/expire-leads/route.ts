import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { revalidateTag } from "next/cache";
import { MARKETPLACE_LEADS_CACHE_TAG } from "@/lib/cache/tags";
import { notifyPublicLeadPublication } from "@/lib/leads/public-publication";
import { notifyPrimeLeadAssignment } from "@/lib/prime/notifications";

type ExpireLeadsResult = {
  expired_count: number;
  hidden_count: number;
};

type ExpireLeadsRpcClient = {
  rpc: (
    fn: "expire_leads" | "release_expired_prime_leads",
    args?: Record<string, unknown>,
  ) => {
    single: () => Promise<RpcResult<ExpireLeadsResult>>;
    then: Promise<RpcResult<ReleasedPrimeLead[]>>["then"];
  };
};

type RpcResult<T> = {
  data: T | null;
  error: { code?: string; message?: string } | null;
};

type ReleasedPrimeLead = { id: string };

export async function GET(request: NextRequest) {
  const cronSecret = getEnv("CRON_SECRET");
  const authHeader = request.headers.get("authorization");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceSupabase = createServiceSupabaseClient();
  const rpcClient = serviceSupabase as unknown as ExpireLeadsRpcClient;
  const { data, error } = await rpcClient.rpc("expire_leads").single();

  if (error || !data) {
    const message = error?.message ?? "Lifecycle lead non eseguito.";

    if (error?.code === "PGRST202" || message.includes("expire_leads")) {
      return NextResponse.json(
        {
          error:
            "Database non aggiornato per lifecycle lead. Applica la migration lead_lifecycle_expiration e riprova.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }

  const primeReleaseResult = await rpcClient.rpc("release_expired_prime_leads", {
    p_limit: 100,
  });
  const primeMigrationMissing =
    primeReleaseResult.error?.code === "PGRST202" ||
    Boolean(
      primeReleaseResult.error?.message?.includes(
        "release_expired_prime_leads",
      ),
    );

  if (primeReleaseResult.error && !primeMigrationMissing) {
    return NextResponse.json(
      { error: primeReleaseResult.error.message ?? "Lifecycle PRIME non eseguito." },
      { status: 500 },
    );
  }

  const releasedPrimeLeads = primeMigrationMissing
    ? []
    : (primeReleaseResult.data ?? []);
  const { data: pendingNotifications, error: pendingError } = await serviceSupabase
    .from("leads")
    .select("id")
    .eq("visibility_mode", "public")
    .not("prime_released_to_public_at", "is", null)
    .is("public_notification_sent_at", null)
    .order("prime_released_to_public_at", { ascending: true })
    .limit(10);

  if (pendingError && !primeMigrationMissing) {
    return NextResponse.json(
      { error: pendingError.message ?? "Notifiche PRIME non caricate." },
      { status: 500 },
    );
  }

  const notificationResults = await Promise.allSettled(
    (pendingNotifications ?? []).map((lead) =>
      notifyPublicLeadPublication(lead.id),
    ),
  );
  const notificationsCompleted = notificationResults.filter(
    (result) => result.status === "fulfilled" && result.value.completed,
  ).length;
  const notificationsPending = notificationResults.length - notificationsCompleted;
  const { data: pendingPrimeAssignments, error: pendingPrimeAssignmentError } =
    await serviceSupabase
      .from("leads")
      .select("id")
      .eq("visibility_mode", "prime_private")
      .is("prime_notification_sent_at", null)
      .gt("prime_access_until", new Date().toISOString())
      .order("prime_assigned_at", { ascending: true })
      .limit(20);

  if (pendingPrimeAssignmentError && !primeMigrationMissing) {
    return NextResponse.json(
      { error: pendingPrimeAssignmentError.message ?? "Notifiche assegnazione PRIME non caricate." },
      { status: 500 },
    );
  }

  const primeAssignmentResults = await Promise.allSettled(
    (pendingPrimeAssignments ?? []).map((lead) =>
      notifyPrimeLeadAssignment(lead.id),
    ),
  );
  const primeAssignmentsCompleted = primeAssignmentResults.filter(
    (result) => result.status === "fulfilled" && result.value.completed,
  ).length;

  if (
    data.expired_count > 0 ||
    data.hidden_count > 0 ||
    releasedPrimeLeads.length > 0
  ) {
    revalidateTag(MARKETPLACE_LEADS_CACHE_TAG, "max");
  }

  return NextResponse.json({
    ok: true,
    expired: data.expired_count,
    hidden: data.hidden_count,
    primeReleased: releasedPrimeLeads.length,
    primeNotificationsCompleted: notificationsCompleted,
    primeNotificationsPending: notificationsPending,
    primeAssignmentsCompleted,
    primeAssignmentsPending:
      primeAssignmentResults.length - primeAssignmentsCompleted,
    primeLifecycleReady: !primeMigrationMissing,
  });
}
