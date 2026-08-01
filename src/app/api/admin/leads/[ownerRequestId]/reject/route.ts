import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import { refreshDuplicateChecksAfterRejection } from "@/lib/owner-requests/duplicate-check";

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
    const payload = rejectSchema.safeParse(
      await request.json().catch(() => ({})),
    );

    if (!payload.success) {
      return NextResponse.json(
        { error: "Inserisci una motivazione di almeno 3 caratteri." },
        { status: 400 },
      );
    }

    const { supabase, profile, isSuperAdmin } =
      await requireSuperAdmin(request);

    const { data: ownerRequest, error: requestError } = await supabase
      .from("owner_requests")
      .select("id,status")
      .eq("id", ownerRequestId)
      .single();

    if (requestError || !ownerRequest) {
      return NextResponse.json(
        { error: "Richiesta non trovata." },
        { status: 404 },
      );
    }

    if (!["to_verify", "pending", "approved"].includes(ownerRequest.status)) {
      return NextResponse.json(
        { error: "Il lead non puo essere scartato nello stato attuale." },
        { status: 409 },
      );
    }

    let { error: updateRequestError } = await supabase
      .from("owner_requests")
      .update({
        status: "not_publishable",
        qualification_notes: payload.data.reason,
        status_reason: payload.data.reason,
      })
      .eq("id", ownerRequestId);

    if (
      updateRequestError &&
      isMissingReviewMetadataError(updateRequestError)
    ) {
      const fallback = await supabase
        .from("owner_requests")
        .update({
          status: "not_publishable",
          qualification_notes: payload.data.reason,
        })
        .eq("id", ownerRequestId);
      updateRequestError = fallback.error;
    }

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

    try {
      await refreshDuplicateChecksAfterRejection({
        supabase,
        rejectedOwnerRequestId: ownerRequestId,
      });
    } catch (refreshError) {
      console.warn(
        "Duplicate checks refresh after rejection failed:",
        refreshError,
      );
    }

    await writeAdminAuditLog({
      supabase,
      request,
      actorProfileId: profile.id,
      isSuperAdmin,
      entityType: "owner_request",
      entityId: ownerRequestId,
      action: "lead.rejected",
      before: { status: ownerRequest.status },
      after: { status: "not_publishable", reason: payload.data.reason },
    });

    return NextResponse.json({ status: "not_publishable" });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

function isMissingReviewMetadataError(error: {
  code?: string;
  message?: string;
}) {
  const message = error.message?.toLowerCase() ?? "";
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    message.includes("status_reason")
  );
}
