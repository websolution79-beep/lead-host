import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import { MARKETPLACE_LEADS_CACHE_TAG } from "@/lib/cache/tags";
import { fetchCommercialSettings } from "@/lib/config/commercial-settings";

type RouteContext = {
  params: Promise<{
    ownerRequestId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { ownerRequestId } = await context.params;
    const { supabase, profile, isSuperAdmin } = await requireSuperAdmin(request);
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select(
        "id,owner_request_id,internal_status,public_status,shared_slots_sold,exclusive_purchase_id,published_at,expires_at,visible_until,sold_at,sold_visible_until,shared_price_cents,exclusive_price_cents",
      )
      .eq("owner_request_id", ownerRequestId)
      .maybeSingle();

    if (leadError) throw leadError;
    if (!lead) {
      return NextResponse.json({ error: "Lead non trovato." }, { status: 404 });
    }

    const now = new Date();
    const expiresAt = lead.expires_at ? new Date(lead.expires_at) : null;
    const isExpired =
      lead.internal_status === "withdrawn_after_7_days" ||
      (["available", "one_slot_sold"].includes(lead.internal_status) &&
        Boolean(expiresAt && expiresAt.getTime() <= now.getTime()));

    if (!isExpired) {
      return NextResponse.json(
        { error: "Solo un lead scaduto puo essere ripubblicato." },
        { status: 409 },
      );
    }

    if (lead.exclusive_purchase_id || lead.shared_slots_sold >= 2) {
      return NextResponse.json(
        { error: "Il lead risulta gia venduto e non puo essere ripubblicato." },
        { status: 409 },
      );
    }

    const { settings } = await fetchCommercialSettings(supabase);
    const republishedAt = now.toISOString();
    const nextExpiresAt = new Date(
      now.getTime() + settings.leadAvailabilityDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    const nextInternalStatus =
      lead.shared_slots_sold === 1 ? "one_slot_sold" : "available";
    const nextPublicStatus =
      lead.shared_slots_sold === 1 ? "last_availability" : "available";

    const { data: republishedLead, error: updateError } = await supabase
      .from("leads")
      .update({
        internal_status: nextInternalStatus,
        public_status: nextPublicStatus,
        published_at: republishedAt,
        expires_at: nextExpiresAt,
        visible_until: null,
        sold_at: null,
        sold_visible_until: null,
      })
      .eq("id", lead.id)
      .eq("internal_status", lead.internal_status)
      .eq("shared_slots_sold", lead.shared_slots_sold)
      .is("exclusive_purchase_id", null)
      .select(
        "id,internal_status,public_status,shared_slots_sold,published_at,expires_at",
      )
      .maybeSingle();

    if (updateError) throw updateError;
    if (!republishedLead) {
      return NextResponse.json(
        {
          error:
            "Lo stato del lead e cambiato durante l'operazione. Aggiorna la pagina e riprova.",
        },
        { status: 409 },
      );
    }

    await writeAdminAuditLog({
      supabase,
      request,
      actorProfileId: profile.id,
      isSuperAdmin,
      entityType: "lead",
      entityId: lead.id,
      action: "lead.republished_without_notifications",
      before: {
        internal_status: lead.internal_status,
        public_status: lead.public_status,
        published_at: lead.published_at,
        expires_at: lead.expires_at,
        visible_until: lead.visible_until,
        shared_slots_sold: lead.shared_slots_sold,
      },
      after: {
        internal_status: nextInternalStatus,
        public_status: nextPublicStatus,
        published_at: republishedAt,
        expires_at: nextExpiresAt,
        shared_slots_sold: lead.shared_slots_sold,
        notifications_sent: false,
      },
    });

    revalidateTag(MARKETPLACE_LEADS_CACHE_TAG, "max");

    return NextResponse.json({
      status: "republished",
      lead: republishedLead,
      notificationsSent: false,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
