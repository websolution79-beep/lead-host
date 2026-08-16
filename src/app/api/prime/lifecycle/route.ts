import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { getAuthenticatedProfileContext } from "@/lib/auth/profile-context";
import { MARKETPLACE_LEADS_CACHE_TAG } from "@/lib/cache/tags";
import { notifyPublicLeadPublication } from "@/lib/leads/public-publication";
import { notifyPrimeLeadAssignment } from "@/lib/prime/notifications";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

type ReleasedPrimeLead = { id: string };

type PrimeLifecycleRpcClient = {
  rpc: (
    fn: "release_expired_prime_leads",
    args: { p_limit: number },
  ) => Promise<{
    data: ReleasedPrimeLead[] | null;
    error: { code?: string; message?: string } | null;
  }>;
};

export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Sessione non trovata." }, { status: 401 });
  }

  const context = await getAuthenticatedProfileContext(token);
  if (!context || context.profile.status !== "active") {
    return NextResponse.json({ error: "Sessione non valida." }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  const rpcClient = supabase as unknown as PrimeLifecycleRpcClient;
  const { data: released, error: releaseError } = await rpcClient.rpc(
    "release_expired_prime_leads",
    { p_limit: 25 },
  );

  if (releaseError) {
    const migrationMissing =
      releaseError.code === "PGRST202" ||
      Boolean(releaseError.message?.includes("release_expired_prime_leads"));
    return NextResponse.json(
      {
        error: migrationMissing
          ? "Lifecycle PRIME non ancora configurato."
          : releaseError.message ?? "Lifecycle PRIME non eseguito.",
      },
      { status: migrationMissing ? 409 : 500 },
    );
  }

  const { data: pendingNotifications, error: pendingError } = await supabase
    .from("leads")
    .select("id")
    .eq("visibility_mode", "public")
    .not("prime_released_to_public_at", "is", null)
    .is("public_notification_sent_at", null)
    .order("prime_released_to_public_at", { ascending: true })
    .limit(5);

  if (pendingError) {
    return NextResponse.json({ error: pendingError.message }, { status: 500 });
  }

  const notificationResults = await Promise.allSettled(
    (pendingNotifications ?? []).map((lead) =>
      notifyPublicLeadPublication(lead.id),
    ),
  );
  const notificationsCompleted = notificationResults.filter(
    (result) => result.status === "fulfilled" && result.value.completed,
  ).length;
  const { data: pendingPrimeNotifications, error: pendingPrimeError } =
    await supabase
      .from("leads")
      .select("id")
      .eq("visibility_mode", "prime_private")
      .is("prime_notification_sent_at", null)
      .gt("prime_access_until", new Date().toISOString())
      .order("prime_assigned_at", { ascending: true })
      .limit(5);

  if (pendingPrimeError) {
    return NextResponse.json({ error: pendingPrimeError.message }, { status: 500 });
  }

  const primeNotificationResults = await Promise.allSettled(
    (pendingPrimeNotifications ?? []).map((lead) =>
      notifyPrimeLeadAssignment(lead.id),
    ),
  );
  const primeNotificationsCompleted = primeNotificationResults.filter(
    (result) => result.status === "fulfilled" && result.value.completed,
  ).length;

  if ((released ?? []).length > 0) {
    revalidateTag(MARKETPLACE_LEADS_CACHE_TAG, "max");
  }

  return NextResponse.json({
    ok: true,
    released: released?.length ?? 0,
    notificationsCompleted,
    notificationsPending:
      notificationResults.length - notificationsCompleted,
    primeAssignmentsCompleted: primeNotificationsCompleted,
    primeAssignmentsPending:
      primeNotificationResults.length - primeNotificationsCompleted,
  });
}
