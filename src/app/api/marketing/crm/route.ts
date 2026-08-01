import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  adminApiErrorResponse,
  requireSuperAdmin,
} from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";

const defaultStages = [
  { name: "Nuovo lead", color: "#2563EB" },
  { name: "WhatsApp inviato", color: "#7C3AED" },
  { name: "Chiamato", color: "#0F766E" },
  { name: "Non risponde", color: "#B45309" },
  { name: "Richiamare", color: "#C2410C" },
  { name: "Sopralluogo fissato", color: "#047857" },
  { name: "Contratto inviato", color: "#4F46E5" },
  { name: "Acquisito", color: "#15803D" },
  { name: "Perso", color: "#B91C1C" },
] as const;

const nullableText = z.string().trim().max(5000).nullable();
const nullableShortText = (max: number) => z.string().trim().max(max).nullable();
const nullableInteger = (min: number, max: number) => z.number().int().min(min).max(max).nullable();
const stageSchema = z.object({
  stageId: z.string().uuid(),
  name: z.string().trim().min(2).max(80).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});
const contactInputSchema = z.object({
  stageId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(140),
  email: z.string().trim().email().max(255).nullable(),
  phone: z.string().trim().max(50).nullable(),
  propertyAddress: z.string().trim().max(300).nullable(),
  propertyType: nullableShortText(80),
  region: nullableShortText(100),
  province: nullableShortText(100),
  city: nullableShortText(120),
  bedrooms: nullableInteger(0, 99),
  bathrooms: nullableInteger(0, 99),
  areaSqm: nullableInteger(1, 100000),
  currentStatus: nullableShortText(120),
  requestedServices: z.array(z.string().trim().min(1).max(120)).max(20),
  timing: nullableShortText(120),
  propertyDescription: nullableText,
  notes: nullableText,
  nextFollowUpAt: z.string().datetime().nullable(),
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
    moveContactsToStageId: z.string().uuid(),
  }),
  z.object({ action: z.literal("create_contact"), contact: contactInputSchema }),
  z.object({
    action: z.literal("update_contact"),
    contactId: z.string().uuid(),
    contact: contactInputSchema,
  }),
  z.object({
    action: z.literal("move_contact"),
    contactId: z.string().uuid(),
    stageId: z.string().uuid(),
  }),
  z.object({ action: z.literal("delete_contact"), contactId: z.string().uuid() }),
]);

export async function GET(request: NextRequest) {
  try {
    const { supabase, profile } = await requireSuperAdmin(request);
    return NextResponse.json(await getCrmPayload(supabase, profile.id));
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile, isSuperAdmin } = await requireSuperAdmin(request);
    const payload = patchSchema.parse(await request.json());
    const crm = await getCrmPayload(supabase, profile.id);
    const pipelineId = crm.pipeline.id;
    let auditEntityType = "marketing_crm";
    let auditEntityId: string | null = null;
    let createdContactId: string | null = null;

    if (payload.action === "create_stage") {
      const { error } = await supabase.from("marketing_crm_stages").insert({
        pipeline_id: pipelineId,
        name: payload.name,
        color: payload.color,
        position: crm.stages.length,
      });
      if (error) throw error;
      auditEntityType = "marketing_crm_stage";
    }

    if (payload.action === "update_stage") {
      ensureStage(crm.stages, payload.stageId);
      const { error } = await supabase
        .from("marketing_crm_stages")
        .update({
          ...(payload.name ? { name: payload.name } : {}),
          ...(payload.color ? { color: payload.color } : {}),
        })
        .eq("id", payload.stageId)
        .eq("pipeline_id", pipelineId);
      if (error) throw error;
      auditEntityType = "marketing_crm_stage";
      auditEntityId = payload.stageId;
    }

    if (payload.action === "move_stage") {
      const currentIndex = crm.stages.findIndex((stage) => stage.id === payload.stageId);
      if (currentIndex < 0) throw new Error("Stage CRM non trovato.");
      const targetIndex = payload.direction === "left" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= crm.stages.length) {
        return NextResponse.json({ error: "Lo stage è già nella posizione richiesta." }, { status: 422 });
      }

      const reordered = [...crm.stages];
      [reordered[currentIndex], reordered[targetIndex]] = [
        reordered[targetIndex],
        reordered[currentIndex],
      ];
      const updates = await Promise.all(
        reordered.map((stage, position) =>
          supabase
            .from("marketing_crm_stages")
            .update({ position })
            .eq("id", stage.id)
            .eq("pipeline_id", pipelineId),
        ),
      );
      const failed = updates.find((result) => result.error);
      if (failed?.error) throw failed.error;
      auditEntityType = "marketing_crm_stage";
      auditEntityId = payload.stageId;
    }

    if (payload.action === "delete_stage") {
      if (crm.stages.length <= 1) {
        return NextResponse.json(
          { error: "La pipeline deve contenere almeno uno stage." },
          { status: 422 },
        );
      }
      ensureStage(crm.stages, payload.stageId);
      ensureStage(crm.stages, payload.moveContactsToStageId);
      if (payload.stageId === payload.moveContactsToStageId) {
        return NextResponse.json(
          { error: "Scegli uno stage diverso per spostare i proprietari." },
          { status: 422 },
        );
      }

      const destinationPosition = nextContactPosition(
        crm.contacts,
        payload.moveContactsToStageId,
      );
      const { error: moveError } = await supabase
        .from("marketing_crm_contacts")
        .update({
          stage_id: payload.moveContactsToStageId,
          position: destinationPosition,
        })
        .eq("pipeline_id", pipelineId)
        .eq("stage_id", payload.stageId);
      if (moveError) throw moveError;

      const { error: deleteError } = await supabase
        .from("marketing_crm_stages")
        .delete()
        .eq("id", payload.stageId)
        .eq("pipeline_id", pipelineId);
      if (deleteError) throw deleteError;
      auditEntityType = "marketing_crm_stage";
      auditEntityId = payload.stageId;
    }

    if (payload.action === "create_contact") {
      ensureStage(crm.stages, payload.contact.stageId);
      const { data: createdContact, error } = await supabase.from("marketing_crm_contacts").insert({
        profile_id: profile.id,
        pipeline_id: pipelineId,
        stage_id: payload.contact.stageId,
        full_name: payload.contact.fullName,
        email: emptyToNull(payload.contact.email),
        phone: emptyToNull(payload.contact.phone),
        property_address: emptyToNull(payload.contact.propertyAddress),
        property_type: emptyToNull(payload.contact.propertyType),
        region: emptyToNull(payload.contact.region),
        province: emptyToNull(payload.contact.province),
        city: emptyToNull(payload.contact.city),
        bedrooms: payload.contact.bedrooms,
        bathrooms: payload.contact.bathrooms,
        area_sqm: payload.contact.areaSqm,
        current_status: emptyToNull(payload.contact.currentStatus),
        requested_services: payload.contact.requestedServices,
        timing: emptyToNull(payload.contact.timing),
        property_description: emptyToNull(payload.contact.propertyDescription),
        notes: emptyToNull(payload.contact.notes),
        next_follow_up_at: payload.contact.nextFollowUpAt,
        position: nextContactPosition(crm.contacts, payload.contact.stageId),
      }).select("id").single();
      if (error) throw error;
      auditEntityType = "marketing_crm_contact";
      auditEntityId = createdContact.id;
      createdContactId = createdContact.id;
    }

    if (payload.action === "update_contact") {
      ensureContact(crm.contacts, payload.contactId);
      ensureStage(crm.stages, payload.contact.stageId);
      const { error } = await supabase
        .from("marketing_crm_contacts")
        .update({
          stage_id: payload.contact.stageId,
          full_name: payload.contact.fullName,
          email: emptyToNull(payload.contact.email),
          phone: emptyToNull(payload.contact.phone),
          property_address: emptyToNull(payload.contact.propertyAddress),
          property_type: emptyToNull(payload.contact.propertyType),
          region: emptyToNull(payload.contact.region),
          province: emptyToNull(payload.contact.province),
          city: emptyToNull(payload.contact.city),
          bedrooms: payload.contact.bedrooms,
          bathrooms: payload.contact.bathrooms,
          area_sqm: payload.contact.areaSqm,
          current_status: emptyToNull(payload.contact.currentStatus),
          requested_services: payload.contact.requestedServices,
          timing: emptyToNull(payload.contact.timing),
          property_description: emptyToNull(payload.contact.propertyDescription),
          notes: emptyToNull(payload.contact.notes),
          next_follow_up_at: payload.contact.nextFollowUpAt,
        })
        .eq("id", payload.contactId)
        .eq("pipeline_id", pipelineId)
        .eq("profile_id", profile.id);
      if (error) throw error;
      auditEntityType = "marketing_crm_contact";
      auditEntityId = payload.contactId;
    }

    if (payload.action === "move_contact") {
      ensureContact(crm.contacts, payload.contactId);
      ensureStage(crm.stages, payload.stageId);
      const { error } = await supabase
        .from("marketing_crm_contacts")
        .update({
          stage_id: payload.stageId,
          position: nextContactPosition(crm.contacts, payload.stageId),
        })
        .eq("id", payload.contactId)
        .eq("pipeline_id", pipelineId)
        .eq("profile_id", profile.id);
      if (error) throw error;
      auditEntityType = "marketing_crm_contact";
      auditEntityId = payload.contactId;
    }

    if (payload.action === "delete_contact") {
      ensureContact(crm.contacts, payload.contactId);
      const { error } = await supabase
        .from("marketing_crm_contacts")
        .delete()
        .eq("id", payload.contactId)
        .eq("pipeline_id", pipelineId)
        .eq("profile_id", profile.id);
      if (error) throw error;
      auditEntityType = "marketing_crm_contact";
      auditEntityId = payload.contactId;
    }

    await writeAdminAuditLog({
      supabase,
      request,
      actorProfileId: profile.id,
      isSuperAdmin,
      entityType: auditEntityType,
      entityId: auditEntityId,
      action: `marketing.crm.${payload.action}`,
      after: { pipeline_id: pipelineId },
    });

    return NextResponse.json({
      ...(await getCrmPayload(supabase, profile.id)),
      ...(createdContactId ? { createdContactId } : {}),
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

async function getCrmPayload(
  supabase: Awaited<ReturnType<typeof requireSuperAdmin>>["supabase"],
  profileId: string,
) {
  const { data: initialPipeline, error } = await supabase
    .from("marketing_crm_pipelines")
    .select("*")
    .eq("profile_id", profileId)
    .eq("is_default", true)
    .maybeSingle();
  if (error) throw error;
  let pipeline = initialPipeline;

  if (!pipeline) {
    const insert = await supabase
      .from("marketing_crm_pipelines")
      .insert({ profile_id: profileId, name: "La mia pipeline", is_default: true })
      .select("*")
      .single();

    if (insert.error && insert.error.code !== "23505") throw insert.error;
    pipeline = insert.data;

    if (!pipeline) {
      const retry = await supabase
        .from("marketing_crm_pipelines")
        .select("*")
        .eq("profile_id", profileId)
        .eq("is_default", true)
        .single();
      if (retry.error) throw retry.error;
      pipeline = retry.data;
    }

    const { count, error: stageCountError } = await supabase
      .from("marketing_crm_stages")
      .select("id", { count: "exact", head: true })
      .eq("pipeline_id", pipeline.id);
    if (stageCountError) throw stageCountError;

    if (!count) {
      const { error: stagesError } = await supabase.from("marketing_crm_stages").insert(
        defaultStages.map((stage, position) => ({
          pipeline_id: pipeline!.id,
          name: stage.name,
          color: stage.color,
          position,
        })),
      );
      if (stagesError) throw stagesError;
    }
  }

  const [stagesResult, contactsResult] = await Promise.all([
    supabase
      .from("marketing_crm_stages")
      .select("*")
      .eq("pipeline_id", pipeline.id)
      .order("position")
      .order("created_at"),
    supabase
      .from("marketing_crm_contacts")
      .select("*")
      .eq("pipeline_id", pipeline.id)
      .eq("profile_id", profileId)
      .order("position")
      .order("created_at"),
  ]);
  if (stagesResult.error) throw stagesResult.error;
  if (contactsResult.error) throw contactsResult.error;

  return {
    pipeline,
    stages: stagesResult.data ?? [],
    contacts: contactsResult.data ?? [],
  };
}

function ensureStage(stages: Array<{ id: string }>, stageId: string) {
  if (!stages.some((stage) => stage.id === stageId)) {
    throw new Error("Stage CRM non valido.");
  }
}

function ensureContact(contacts: Array<{ id: string }>, contactId: string) {
  if (!contacts.some((contact) => contact.id === contactId)) {
    throw new Error("Proprietario CRM non valido.");
  }
}

function nextContactPosition(
  contacts: Array<{ stage_id: string; position: number }>,
  stageId: string,
) {
  return (
    Math.max(
      -1,
      ...contacts
        .filter((contact) => contact.stage_id === stageId)
        .map((contact) => contact.position),
    ) + 1
  );
}

function emptyToNull(value: string | null) {
  return value?.trim() || null;
}
