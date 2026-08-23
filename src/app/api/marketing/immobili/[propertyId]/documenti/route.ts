import { randomUUID } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminApiErrorResponse, AdminApiError } from "@/lib/admin/auth";
import { requireMarketingAddonAccess } from "@/lib/addons/access";
import { writeAdminAuditLog } from "@/lib/admin/audit";

const bucket = "marketing-managed-property-documents";
const maxBytes = 10 * 1024 * 1024;
const allowedTypes = new Map([["application/pdf", "pdf"], ["application/msword", "doc"], ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"]]);
const categorySchema = z.enum(["contract", "floorplan", "manual", "maintenance", "other"]);
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_upload"), category: categorySchema, maintenanceId: z.string().uuid().nullable(), fileName: z.string().trim().min(1).max(255), contentType: z.string(), byteSize: z.number().int().positive().max(maxBytes) }),
  z.object({ action: z.literal("complete_upload"), category: categorySchema, maintenanceId: z.string().uuid().nullable(), storagePath: z.string().min(1).max(500), fileName: z.string().trim().min(1).max(255), contentType: z.string(), byteSize: z.number().int().positive().max(maxBytes) }),
  z.object({ action: z.literal("delete_document"), documentId: z.string().uuid() }),
]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ propertyId: string }> }) {
  try {
    const { supabase, profile, isSuperAdmin } = await requireMarketingAddonAccess(request); const { propertyId } = await params;
    await ensureProperty(supabase, propertyId, profile.id); const payload = actionSchema.parse(await request.json());
    if (payload.action === "create_upload") {
      const extension = allowedTypes.get(payload.contentType); if (!extension) throw new AdminApiError(422, "Sono ammessi solo PDF, DOC e DOCX fino a 10 MB.");
      await ensureMaintenance(supabase, payload.maintenanceId, propertyId, profile.id);
      const storagePath = `${profile.id}/${propertyId}/${randomUUID()}.${extension}`; const signed = await supabase.storage.from(bucket).createSignedUploadUrl(storagePath); if (signed.error || !signed.data) throw signed.error ?? new Error("Upload documento non disponibile."); return NextResponse.json({ storagePath, token: signed.data.token });
    }
    if (payload.action === "complete_upload") {
      if (!allowedTypes.has(payload.contentType) || !payload.storagePath.startsWith(`${profile.id}/${propertyId}/`)) throw new AdminApiError(422, "Documento non valido.");
      await ensureMaintenance(supabase, payload.maintenanceId, propertyId, profile.id);
      const { data, error } = await supabase.from("marketing_managed_property_documents").insert({ property_id: propertyId, maintenance_id: payload.maintenanceId, profile_id: profile.id, category: payload.category, storage_path: payload.storagePath, original_name: cleanFileName(payload.fileName), content_type: payload.contentType, byte_size: payload.byteSize }).select("*").single(); if (error) throw error;
      await writeAdminAuditLog({ supabase, request, actorProfileId: profile.id, isSuperAdmin, actorRole: isSuperAdmin ? "super_admin" : "property_manager", entityType: "marketing_managed_property_document", entityId: data.id, action: "uploaded", after: { propertyId, fileName: data.original_name, category: data.category } }); return NextResponse.json({ document: data });
    }
    const { data: document, error: findError } = await supabase.from("marketing_managed_property_documents").select("*").eq("id", payload.documentId).eq("property_id", propertyId).eq("profile_id", profile.id).maybeSingle(); if (findError) throw findError; if (!document) throw new AdminApiError(404, "Documento non trovato.");
    await supabase.storage.from(bucket).remove([document.storage_path]); const { error } = await supabase.from("marketing_managed_property_documents").delete().eq("id", document.id).eq("profile_id", profile.id); if (error) throw error;
    await writeAdminAuditLog({ supabase, request, actorProfileId: profile.id, isSuperAdmin, actorRole: isSuperAdmin ? "super_admin" : "property_manager", entityType: "marketing_managed_property_document", entityId: document.id, action: "deleted", before: { propertyId, fileName: document.original_name } }); return NextResponse.json({ ok: true });
  } catch (error) { return adminApiErrorResponse(error); }
}

async function ensureProperty(supabase: Awaited<ReturnType<typeof requireMarketingAddonAccess>>["supabase"], propertyId: string, profileId: string) { const { data, error } = await supabase.from("marketing_managed_properties").select("id").eq("id", propertyId).eq("profile_id", profileId).maybeSingle(); if (error) throw error; if (!data) throw new AdminApiError(404, "Immobile non trovato."); }
async function ensureMaintenance(supabase: Awaited<ReturnType<typeof requireMarketingAddonAccess>>["supabase"], maintenanceId: string | null, propertyId: string, profileId: string) { if (!maintenanceId) return; const { data, error } = await supabase.from("marketing_managed_property_maintenance").select("id").eq("id", maintenanceId).eq("property_id", propertyId).eq("profile_id", profileId).maybeSingle(); if (error) throw error; if (!data) throw new AdminApiError(422, "Manutenzione non valida."); }
function cleanFileName(fileName: string) { return fileName.replace(/[\\/:*?"<>|]/g, "-").trim().slice(0, 255); }
