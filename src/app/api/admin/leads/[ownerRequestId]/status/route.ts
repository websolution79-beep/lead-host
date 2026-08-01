import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";

type RouteContext = {
  params: Promise<{
    ownerRequestId: string;
  }>;
};

const statusSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("pending"),
    reason: z.string().trim().min(3).max(600),
  }),
  z.object({
    status: z.literal("to_verify"),
    reason: z.string().trim().max(600).optional(),
  }),
]);

const movableStatuses = new Set([
  "new_from_meta",
  "completed",
  "pending",
  "to_verify",
  "approved",
  "not_publishable",
]);

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { ownerRequestId } = await context.params;
    const payload = statusSchema.safeParse(await request.json().catch(() => ({})));

    if (!payload.success) {
      return NextResponse.json(
        {
          error:
            "Per spostare il lead in Pending inserisci una motivazione di almeno 3 caratteri.",
        },
        { status: 400 },
      );
    }

    const { supabase, profile, isSuperAdmin } = await requireSuperAdmin(request);
    const { data: ownerRequest, error: requestError } = await supabase
      .from("owner_requests")
      .select("id,status,status_reason")
      .eq("id", ownerRequestId)
      .maybeSingle();

    if (requestError) throw requestError;
    if (!ownerRequest) {
      return NextResponse.json({ error: "Richiesta non trovata." }, { status: 404 });
    }

    if (!movableStatuses.has(ownerRequest.status)) {
      return NextResponse.json(
        {
          error:
            "Questo lead non puo essere spostato senza modificare il suo stato nel marketplace.",
        },
        { status: 409 },
      );
    }

    if (ownerRequest.status === payload.data.status) {
      return NextResponse.json({ status: ownerRequest.status });
    }

    const changedAt = new Date().toISOString();
    const statusReason =
      payload.data.status === "pending" ? payload.data.reason : null;
    const { error: updateError } = await supabase
      .from("owner_requests")
      .update({
        status: payload.data.status,
        status_reason: statusReason,
      })
      .eq("id", ownerRequestId);

    if (updateError) throw updateError;

    await writeAdminAuditLog({
      supabase,
      request,
      actorProfileId: profile.id,
      isSuperAdmin,
      entityType: "owner_request",
      entityId: ownerRequestId,
      action:
        payload.data.status === "pending"
          ? "lead.moved_to_pending"
          : "lead.moved_to_review",
      before: {
        status: ownerRequest.status,
        reason: ownerRequest.status_reason,
      },
      after: {
        status: payload.data.status,
        reason: statusReason,
        changed_at: changedAt,
      },
    });

    return NextResponse.json({
      status: payload.data.status,
      statusReason,
      statusChangedAt: changedAt,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
