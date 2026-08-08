import { NextResponse, type NextRequest } from "next/server";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { adminApiErrorResponse, requireAdminPermission } from "@/lib/admin/auth";
import {
  sendManualLeadToTelegram,
  TelegramServiceError,
} from "@/lib/telegram/service";

type RouteContext = {
  params: Promise<{ ownerRequestId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { ownerRequestId } = await context.params;
    const { supabase, profile, isSuperAdmin } = await requireAdminPermission(
      request,
      "telegram_manual_publish",
      "write",
    );

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select(
        "id,owner_request_id,title,property_id,public_status,shared_price_cents,exclusive_price_cents,shared_slots_sold",
      )
      .eq("owner_request_id", ownerRequestId)
      .maybeSingle();

    if (leadError) throw leadError;
    if (!lead) {
      return NextResponse.json({ error: "Lead pubblicato non trovato." }, { status: 404 });
    }

    if (!["available", "last_availability"].includes(lead.public_status)) {
      return NextResponse.json(
        { error: "Puoi inviare su Telegram solo un lead ancora disponibile." },
        { status: 409 },
      );
    }

    const [{ data: ownerRequest, error: requestError }, { data: property, error: propertyError }] =
      await Promise.all([
        supabase
          .from("owner_requests")
          .select("status")
          .eq("id", ownerRequestId)
          .maybeSingle(),
        supabase
          .from("properties")
          .select("city,province,property_type")
          .eq("id", lead.property_id)
          .maybeSingle(),
      ]);

    if (requestError) throw requestError;
    if (propertyError) throw propertyError;
    if (ownerRequest?.status !== "published") {
      return NextResponse.json({ error: "Lead non pubblicato." }, { status: 409 });
    }

    let delivery;
    try {
      delivery = await sendManualLeadToTelegram({
        id: lead.id,
        title: lead.title,
        city: property?.city ?? null,
        province: property?.province ?? null,
        propertyType: property?.property_type ?? null,
        sharedPriceCents: lead.shared_price_cents,
        exclusivePriceCents: lead.exclusive_price_cents,
        sharedSlotsSold: lead.shared_slots_sold,
      });
    } catch (error) {
      if (error instanceof TelegramServiceError) {
        return NextResponse.json({ error: error.message }, { status: 502 });
      }
      throw error;
    }

    await writeAdminAuditLog({
      supabase,
      request,
      actorProfileId: profile.id,
      isSuperAdmin,
      entityType: "lead",
      entityId: lead.id,
      action: "lead.telegram_manual_sent",
      after: {
        owner_request_id: ownerRequestId,
        telegram_message_id: delivery.messageId,
      },
    });

    return NextResponse.json({ status: "sent", messageId: delivery.messageId });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
