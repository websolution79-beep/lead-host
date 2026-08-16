import { after, NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import { hasAdminPermission } from "@/lib/admin/permissions";
import { MARKETPLACE_LEADS_CACHE_TAG } from "@/lib/cache/tags";
import { notifyPublicLeadPublication } from "@/lib/leads/public-publication";

type RouteContext = {
  params: Promise<{ ownerRequestId: string }>;
};

type ReleasedLead = {
  id: string;
  visibility_mode: string;
  published_at: string | null;
  expires_at: string | null;
};

type PrimeReleaseRpcClient = {
  rpc: (
    fn: "release_prime_lead_to_public",
    args: {
      p_lead_id: string;
      p_release_reason: "manual";
      p_actor_profile_id: string;
      p_actor_team_member_id: string | null;
    },
  ) => Promise<{
    data: ReleasedLead | null;
    error: { code?: string; message?: string } | null;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { ownerRequestId } = await context.params;
    const { supabase, profile, isSuperAdmin, permissions, teamMemberId } =
      await requireSuperAdmin(request);

    if (
      !isSuperAdmin &&
      (!hasAdminPermission(permissions, "leads", "write") ||
        !hasAdminPermission(permissions, "prime", "write"))
    ) {
      return NextResponse.json(
        { error: "Non hai il permesso di pubblicare un lead PRIME." },
        { status: 403 },
      );
    }

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select(
        "id,visibility_mode,prime_target_property_manager_id,prime_access_started_at,prime_access_until,published_at,expires_at,internal_status,shared_slots_sold,exclusive_purchase_id",
      )
      .eq("owner_request_id", ownerRequestId)
      .maybeSingle();

    if (leadError) throw leadError;
    if (!lead) {
      return NextResponse.json({ error: "Lead non trovato." }, { status: 404 });
    }
    if (lead.visibility_mode !== "prime_private") {
      return NextResponse.json(
        { error: "Il lead non si trova nella Prime Zone." },
        { status: 409 },
      );
    }
    if (
      lead.internal_status !== "available" ||
      lead.shared_slots_sold > 0 ||
      lead.exclusive_purchase_id
    ) {
      return NextResponse.json(
        { error: "Il lead PRIME non è più disponibile per la pubblicazione." },
        { status: 409 },
      );
    }

    const rpcClient = supabase as unknown as PrimeReleaseRpcClient;
    const { data: releasedLead, error: releaseError } = await rpcClient.rpc(
      "release_prime_lead_to_public",
      {
        p_lead_id: lead.id,
        p_release_reason: "manual",
        p_actor_profile_id: profile.id,
        p_actor_team_member_id: teamMemberId,
      },
    );

    if (releaseError || !releasedLead) {
      const message = releaseError?.message ?? "Lead PRIME non pubblicato.";
      if (
        releaseError?.code === "PGRST202" ||
        message.includes("release_prime_lead_to_public")
      ) {
        return NextResponse.json(
          { error: "Applica la migration del lifecycle PRIME e riprova." },
          { status: 409 },
        );
      }
      throw releaseError ?? new Error(message);
    }

    await writeAdminAuditLog({
      supabase,
      request,
      actorProfileId: profile.id,
      isSuperAdmin,
      entityType: "lead",
      entityId: lead.id,
      action: "lead.prime_released_to_public",
      before: {
        visibility_mode: lead.visibility_mode,
        prime_target_property_manager_id:
          lead.prime_target_property_manager_id,
        prime_access_started_at: lead.prime_access_started_at,
        prime_access_until: lead.prime_access_until,
        published_at: lead.published_at,
        expires_at: lead.expires_at,
      },
      after: {
        visibility_mode: releasedLead.visibility_mode,
        published_at: releasedLead.published_at,
        expires_at: releasedLead.expires_at,
        release_reason: "manual",
        notifications_queued: true,
      },
    });

    revalidateTag(MARKETPLACE_LEADS_CACHE_TAG, "max");
    after(async () => {
      const result = await notifyPublicLeadPublication(lead.id).catch(
        (notificationError) => {
          console.warn(
            "Manual PRIME release notifications failed:",
            notificationError,
          );
          return null;
        },
      );

      if (result && !result.completed) {
        console.warn("Manual PRIME release notifications incomplete:", result);
      }
    });

    return NextResponse.json({
      status: "published",
      lead: releasedLead,
      notificationsQueued: true,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
