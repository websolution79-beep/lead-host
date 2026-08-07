import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";

const stageSchema = z.object({
  stageId: z.string().uuid(),
  name: z.string().trim().min(2).max(80).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_stage"),
    name: z.string().trim().min(2).max(80),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  }),
  z.object({ action: z.literal("update_stage"), ...stageSchema.shape }),
  z.object({
    action: z.literal("move_stage"),
    stageId: z.string().uuid(),
    direction: z.enum(["left", "right"]),
  }),
  z.object({
    action: z.literal("delete_stage"),
    stageId: z.string().uuid(),
    moveRequestsToStageId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("move_request"),
    ownerRequestId: z.string().uuid(),
    stageId: z.string().uuid(),
  }),
]);

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    return NextResponse.json({ stages: await getStages(supabase) });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile, isSuperAdmin } = await requireSuperAdmin(request);
    const payload = patchSchema.parse(await request.json());
    const stages = await getStages(supabase);
    let entityId: string | null = null;

    if (payload.action === "create_stage") {
      const { error } = await supabase.from("admin_lead_pipeline_stages").insert({
        name: payload.name,
        color: payload.color,
        position: stages.length,
      });
      if (error) throw error;
    }

    if (payload.action === "update_stage") {
      ensureStage(stages, payload.stageId);
      const { error } = await supabase
        .from("admin_lead_pipeline_stages")
        .update({
          ...(payload.name ? { name: payload.name } : {}),
          ...(payload.color ? { color: payload.color } : {}),
        })
        .eq("id", payload.stageId);
      if (error) throw error;
      entityId = payload.stageId;
    }

    if (payload.action === "move_stage") {
      const index = stages.findIndex((stage) => stage.id === payload.stageId);
      if (index < 0) throw new Error("Colonna non trovata.");
      const target = payload.direction === "left" ? index - 1 : index + 1;
      if (target < 0 || target >= stages.length) {
        return NextResponse.json({ error: "La colonna è già nella posizione richiesta." }, { status: 422 });
      }
      const reordered = [...stages];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      const updates = await Promise.all(
        reordered.map((stage, position) =>
          supabase.from("admin_lead_pipeline_stages").update({ position }).eq("id", stage.id),
        ),
      );
      const failed = updates.find((result) => result.error);
      if (failed?.error) throw failed.error;
      entityId = payload.stageId;
    }

    if (payload.action === "delete_stage") {
      if (stages.length <= 1) {
        return NextResponse.json({ error: "La pipeline deve contenere almeno una colonna." }, { status: 422 });
      }
      ensureStage(stages, payload.stageId);
      ensureStage(stages, payload.moveRequestsToStageId);
      if (payload.stageId === payload.moveRequestsToStageId) {
        return NextResponse.json({ error: "Scegli una colonna diversa per spostare i lead." }, { status: 422 });
      }
      const { error: moveError } = await supabase
        .from("owner_requests")
        .update({ review_pipeline_stage_id: payload.moveRequestsToStageId })
        .eq("review_pipeline_stage_id", payload.stageId);
      if (moveError) throw moveError;
      const { error: deleteError } = await supabase
        .from("admin_lead_pipeline_stages")
        .delete()
        .eq("id", payload.stageId);
      if (deleteError) throw deleteError;
      entityId = payload.stageId;
    }

    if (payload.action === "move_request") {
      ensureStage(stages, payload.stageId);
      const { data: ownerRequest, error: requestError } = await supabase
        .from("owner_requests")
        .select("id,status")
        .eq("id", payload.ownerRequestId)
        .maybeSingle();
      if (requestError) throw requestError;
      if (!ownerRequest) {
        return NextResponse.json({ error: "Lead non trovato." }, { status: 404 });
      }
      if (ownerRequest.status !== "to_verify") {
        return NextResponse.json(
          { error: "Puoi spostare nella pipeline solo i lead nello stato Nuovi Lead." },
          { status: 409 },
        );
      }
      const { data: movedRequest, error } = await supabase.rpc(
        "move_owner_request_review_pipeline_stage",
        {
          p_owner_request_id: payload.ownerRequestId,
          p_stage_id: payload.stageId,
          p_actor_profile_id: profile.id,
        },
      );
      if (error) throw error;
      if (!movedRequest) {
        return NextResponse.json(
          { error: "Il lead non e piu disponibile nella pipeline Nuovi Lead." },
          { status: 409 },
        );
      }
      entityId = payload.ownerRequestId;
    }

    await writeAdminAuditLog({
      supabase,
      request,
      actorProfileId: profile.id,
      isSuperAdmin,
      actorRole: isSuperAdmin ? "super_admin" : "team_member",
      entityType: payload.action === "move_request" ? "owner_request" : "admin_lead_pipeline_stage",
      entityId,
      action: `lead.pipeline.${payload.action}`,
      after: { action: payload.action },
    });

    return NextResponse.json({ stages: await getStages(supabase) });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

async function getStages(supabase: Awaited<ReturnType<typeof requireSuperAdmin>>["supabase"]) {
  const { data, error } = await supabase
    .from("admin_lead_pipeline_stages")
    .select("id,name,color,position")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

function ensureStage(stages: Array<{ id: string }>, stageId: string) {
  if (!stages.some((stage) => stage.id === stageId)) {
    throw new Error("Colonna della pipeline non trovata.");
  }
}
