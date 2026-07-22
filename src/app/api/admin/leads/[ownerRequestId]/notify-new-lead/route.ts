import { NextResponse, type NextRequest } from "next/server";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import { notifyImmediateNewLead } from "@/lib/email/notifications";

type RouteContext = {
  params: Promise<{
    ownerRequestId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { ownerRequestId } = await context.params;
    const { supabase } = await requireSuperAdmin(request);
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select(
        "id,title,property_id,public_status,shared_price_cents,exclusive_price_cents",
      )
      .eq("owner_request_id", ownerRequestId)
      .maybeSingle();

    if (leadError) throw leadError;

    if (!lead) {
      return NextResponse.json({ error: "Lead pubblicato non trovato." }, { status: 404 });
    }

    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .select("city,province")
      .eq("id", lead.property_id)
      .maybeSingle();

    if (propertyError) throw propertyError;

    const notification = await notifyImmediateNewLead({
      id: lead.id,
      title: lead.title,
      city: property?.city ?? null,
      province: property?.province ?? null,
      shared_price_cents: lead.shared_price_cents,
      exclusive_price_cents: lead.exclusive_price_cents,
    });

    return NextResponse.json({ status: "ok", notification });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
