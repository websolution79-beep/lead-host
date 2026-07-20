import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";

type RouteContext = {
  params: Promise<{
    ownerRequestId: string;
  }>;
};

const rejectSchema = z.object({
  reason: z.string().trim().min(3).max(600),
});

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { ownerRequestId } = await context.params;
    const payload = rejectSchema.safeParse(await request.json().catch(() => ({})));

    if (!payload.success) {
      return NextResponse.json(
        { error: "Inserisci una motivazione di almeno 3 caratteri." },
        { status: 400 },
      );
    }

    const { supabase, profile } = await requireSuperAdmin(request);

    const { data: ownerRequest, error: requestError } = await supabase
      .from("owner_requests")
      .select("id,status")
      .eq("id", ownerRequestId)
      .single();

    if (requestError || !ownerRequest) {
      return NextResponse.json({ error: "Richiesta non trovata." }, { status: 404 });
    }

    const { error: updateRequestError } = await supabase
      .from("owner_requests")
      .update({
        status: "not_publishable",
        qualification_notes: payload.data.reason,
      })
      .eq("id", ownerRequestId);

    if (updateRequestError) {
      throw updateRequestError;
    }

    await supabase
      .from("leads")
      .update({
        internal_status: "cancelled",
        public_status: "unavailable",
        visible_until: new Date().toISOString(),
      })
      .eq("owner_request_id", ownerRequestId);

    const auditLogs = supabase.from("audit_logs" as never) as unknown as {
      insert: (row: Record<string, unknown>) => Promise<unknown>;
    };

    await auditLogs.insert({
      actor_profile_id: profile.id,
      actor_role: "super_admin",
      entity_type: "owner_request",
      entity_id: ownerRequestId,
      action: "lead.rejected",
      before: { status: ownerRequest.status },
      after: { status: "not_publishable", reason: payload.data.reason },
    });

    return NextResponse.json({ status: "not_publishable" });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
