import { randomUUID } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminApiErrorResponse, AdminApiError } from "@/lib/admin/auth";
import { requireMarketingAddonAccess } from "@/lib/addons/access";
import { writeAdminAuditLog } from "@/lib/admin/audit";

const bucket = "marketing-managed-property-covers";
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 2 * 1024 * 1024;
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_upload"), fileName: z.string().trim().min(1).max(255), contentType: z.string(), byteSize: z.number().int().positive().max(maxBytes) }),
  z.object({ action: z.literal("complete_upload"), storagePath: z.string().min(1).max(500), fileName: z.string().trim().min(1).max(255), contentType: z.string(), byteSize: z.number().int().positive().max(maxBytes) }),
  z.object({ action: z.literal("delete_cover") }),
]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ propertyId: string }> }) {
  try {
    const { supabase, profile, isSuperAdmin } = await requireMarketingAddonAccess(request);
    const { propertyId } = await params;
    const property = await ensureProperty(supabase, propertyId, profile.id);
    const payload = actionSchema.parse(await request.json());
    if (payload.action === "create_upload") {
      if (!allowedTypes.has(payload.contentType)) throw new AdminApiError(422, "Sono ammesse immagini JPG, PNG o WEBP fino a 2 MB.");
      const extension = payload.contentType === "image/jpeg" ? "jpg" : payload.contentType.split("/")[1];
      const storagePath = `${profile.id}/${propertyId}/cover/${randomUUID()}.${extension}`;
      const signed = await supabase.storage.from(bucket).createSignedUploadUrl(storagePath);
      if (signed.error || !signed.data) throw signed.error ?? new Error("Upload immagine non disponibile.");
      return NextResponse.json({ storagePath, token: signed.data.token });
    }
    if (payload.action === "complete_upload") {
      if (!allowedTypes.has(payload.contentType) || !payload.storagePath.startsWith(`${profile.id}/${propertyId}/cover/`)) throw new AdminApiError(422, "Immagine copertina non valida.");
      const previousPath = property.cover_image_path;
      const { error } = await supabase.from("marketing_managed_properties").update({ cover_image_path: payload.storagePath, cover_image_name: cleanFileName(payload.fileName), cover_image_content_type: payload.contentType, cover_image_byte_size: payload.byteSize }).eq("id", propertyId).eq("profile_id", profile.id);
      if (error) throw error;
      if (previousPath && previousPath !== payload.storagePath) await supabase.storage.from(bucket).remove([previousPath]);
      await writeAdminAuditLog({ supabase, request, actorProfileId: profile.id, isSuperAdmin, actorRole: isSuperAdmin ? "super_admin" : "property_manager", entityType: "marketing_managed_property", entityId: propertyId, action: "cover_uploaded", after: { fileName: cleanFileName(payload.fileName), byteSize: payload.byteSize } });
      return NextResponse.json({ ok: true });
    }
    if (property.cover_image_path) await supabase.storage.from(bucket).remove([property.cover_image_path]);
    const { error } = await supabase.from("marketing_managed_properties").update({ cover_image_path: null, cover_image_name: null, cover_image_content_type: null, cover_image_byte_size: null }).eq("id", propertyId).eq("profile_id", profile.id);
    if (error) throw error;
    await writeAdminAuditLog({ supabase, request, actorProfileId: profile.id, isSuperAdmin, actorRole: isSuperAdmin ? "super_admin" : "property_manager", entityType: "marketing_managed_property", entityId: propertyId, action: "cover_deleted" });
    return NextResponse.json({ ok: true });
  } catch (error) { return adminApiErrorResponse(error); }
}

async function ensureProperty(supabase: Awaited<ReturnType<typeof requireMarketingAddonAccess>>["supabase"], propertyId: string, profileId: string) {
  if (!z.string().uuid().safeParse(propertyId).success) throw new AdminApiError(404, "Immobile non trovato.");
  const { data, error } = await supabase.from("marketing_managed_properties").select("id,cover_image_path").eq("id", propertyId).eq("profile_id", profileId).maybeSingle();
  if (error) throw error; if (!data) throw new AdminApiError(404, "Immobile non trovato."); return data;
}
function cleanFileName(fileName: string) { return fileName.replace(/[\\/:*?"<>|]/g, "-").trim().slice(0, 255); }
