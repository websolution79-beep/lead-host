import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AdminApiError } from "@/lib/admin/auth";
import { requireMarketingAddonAccess } from "@/lib/addons/access";

export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const { supabase, profile } = await requireMarketingAddonAccess(request);
    const contactId = z.string().uuid().parse(request.nextUrl.searchParams.get("contactId"));
    const page = z.coerce.number().int().min(1).max(10000).parse(request.nextUrl.searchParams.get("page") ?? 1);
    const contact = await supabase.from("marketing_crm_contacts").select("id")
      .eq("id", contactId).eq("profile_id", profile.id).maybeSingle();
    if (contact.error) throw contact.error;
    if (!contact.data) throw new AdminApiError(404, "Contatto non trovato.");
    const result = await supabase.from("marketing_systeme_contact_fields").select("id,flow_name,label,value", { count: "exact" })
      .eq("crm_contact_id", contactId).eq("profile_id", profile.id).order("created_at").order("id").range((page - 1) * 100, page * 100 - 1);
    if (result.error) throw result.error;
    return NextResponse.json({ fields: result.data.map((field) => ({ id: field.id, flowName: field.flow_name, label: field.label, value: field.value })), page, total: result.count ?? 0 }, { headers });
  } catch (error) {
    if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Contatto non valido." }, { status: 422, headers });
    console.error("Systeme.io imported answers temporarily unavailable.");
    return NextResponse.json({ error: "Risposte importate non disponibili. Riprova tra poco." }, { status: 503, headers });
  }
}
