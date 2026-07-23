import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  propertyManagerApiErrorResponse,
  requirePropertyManager,
} from "@/lib/api/property-manager-auth";
import { sendSupportMessageAdminNotification } from "@/lib/email/notifications";
import { getSupportSubjectLabel } from "@/lib/support/reports";

const messageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ reportId: string }> },
) {
  try {
    const { supabase, profile, propertyManager } = await requirePropertyManager(request);
    const { reportId } = await context.params;
    const payload = messageSchema.parse(await request.json());

    const { data: report, error: reportError } = await supabase
      .from("reports")
      .select("id,property_manager_id,subject,lead_purchase_id")
      .eq("id", reportId)
      .eq("property_manager_id", propertyManager.id)
      .maybeSingle();

    if (reportError) throw reportError;
    if (!report) {
      return NextResponse.json({ error: "Richiesta non trovata." }, { status: 404 });
    }

    const { data: message, error: messageError } = await supabase
      .from("support_messages")
      .insert({
        report_id: report.id,
        sender_type: "pm",
        sender_profile_id: profile.id,
        body: payload.body,
      })
      .select("id,created_at")
      .single();

    if (messageError) throw messageError;

    const leadContext = await getLeadContext(supabase, report.lead_purchase_id);
    await sendSupportMessageAdminNotification({
      reportId: report.id,
      propertyManagerName:
        [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
        profile.email,
      propertyManagerEmail: profile.email,
      requestSubject: getSupportSubjectLabel(report.subject),
      reply: payload.body,
      leadContext,
    });

    return NextResponse.json({
      ok: true,
      message: {
        id: message.id,
        senderType: "pm",
        body: payload.body,
        createdAt: message.created_at,
      },
    });
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}

async function getLeadContext(
  supabase: Awaited<ReturnType<typeof requirePropertyManager>>["supabase"],
  leadPurchaseId: string | null,
) {
  if (!leadPurchaseId) return "Nessun lead acquistato associato.";

  const { data: purchase, error: purchaseError } = await supabase
    .from("lead_purchases")
    .select("lead_id")
    .eq("id", leadPurchaseId)
    .maybeSingle();

  if (purchaseError) throw purchaseError;
  if (!purchase) return "Nessun lead acquistato associato.";

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("title")
    .eq("id", purchase.lead_id)
    .maybeSingle();

  if (leadError) throw leadError;

  return lead ? `Lead acquistato: ${lead.title}.` : "Nessun lead acquistato associato.";
}
