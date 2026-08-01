import { randomUUID } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminApiErrorResponse, AdminApiError, requireSuperAdmin } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";

const bucket = "marketing-crm-property-images";
const maxImages = 10;
const maxImageBytes = 1024 * 1024;

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_upload"), contactId: z.string().uuid(), fileName: z.string().trim().min(1).max(255), byteSize: z.number().int().positive().max(maxImageBytes), width: z.number().int().min(1).max(1920), height: z.number().int().min(1).max(1920) }),
  z.object({ action: z.literal("complete_upload"), contactId: z.string().uuid(), storagePath: z.string().min(1).max(500), fileName: z.string().trim().min(1).max(255), byteSize: z.number().int().positive().max(maxImageBytes), width: z.number().int().min(1).max(1920), height: z.number().int().min(1).max(1920) }),
  z.object({ action: z.literal("delete_image"), imageId: z.string().uuid() }),
]);

export async function GET(request: NextRequest) {
  try {
    const { supabase, profile } = await requireSuperAdmin(request);
    const contactId = z.string().uuid().parse(request.nextUrl.searchParams.get("contactId"));
    await ensureContact(supabase, contactId, profile.id);
    const { data, error } = await supabase.from("marketing_crm_property_images").select("*").eq("contact_id", contactId).eq("profile_id", profile.id).order("position").order("created_at");
    if (error) throw error;
    const images = await Promise.all((data ?? []).map(async (image) => {
      const signed = await supabase.storage.from(bucket).createSignedUrl(image.storage_path, 300);
      if (signed.error || !signed.data?.signedUrl) throw signed.error ?? new Error("Immagine non disponibile.");
      return { ...image, image_url: signed.data.signedUrl };
    }));
    return NextResponse.json({ images });
  } catch (error) { return adminApiErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile, isSuperAdmin } = await requireSuperAdmin(request);
    const payload = actionSchema.parse(await request.json());
    if (payload.action === "create_upload") {
      await ensureContact(supabase, payload.contactId, profile.id);
      const { count, error: countError } = await supabase.from("marketing_crm_property_images").select("id", { count: "exact", head: true }).eq("contact_id", payload.contactId).eq("profile_id", profile.id);
      if (countError) throw countError;
      if ((count ?? 0) >= maxImages) throw new AdminApiError(422, "Puoi allegare al massimo 10 immagini per immobile.");
      const storagePath = `${profile.id}/${payload.contactId}/${randomUUID()}.webp`;
      const signed = await supabase.storage.from(bucket).createSignedUploadUrl(storagePath);
      if (signed.error || !signed.data) throw signed.error ?? new Error("Upload immagine non disponibile.");
      return NextResponse.json({ storagePath, token: signed.data.token });
    }
    if (payload.action === "complete_upload") {
      await ensureContact(supabase, payload.contactId, profile.id);
      if (!payload.storagePath.startsWith(`${profile.id}/${payload.contactId}/`) || !payload.storagePath.endsWith(".webp")) throw new AdminApiError(422, "Percorso immagine non valido.");
      const { count, error: countError } = await supabase.from("marketing_crm_property_images").select("id", { count: "exact", head: true }).eq("contact_id", payload.contactId).eq("profile_id", profile.id);
      if (countError) throw countError;
      if ((count ?? 0) >= maxImages) throw new AdminApiError(422, "Puoi allegare al massimo 10 immagini per immobile.");
      const { data: image, error } = await supabase.from("marketing_crm_property_images").insert({ profile_id: profile.id, contact_id: payload.contactId, storage_path: payload.storagePath, original_name: cleanFileName(payload.fileName), byte_size: payload.byteSize, width: payload.width, height: payload.height, position: count ?? 0 }).select("*").single();
      if (error) throw error;
      await writeAdminAuditLog({ supabase, request, actorProfileId: profile.id, isSuperAdmin, entityType: "marketing_crm_property_image", entityId: image.id, action: "uploaded", after: { contactId: payload.contactId, fileName: image.original_name, byteSize: image.byte_size } });
      return NextResponse.json({ image });
    }
    const { data: image, error: imageError } = await supabase.from("marketing_crm_property_images").select("*").eq("id", payload.imageId).eq("profile_id", profile.id).maybeSingle();
    if (imageError) throw imageError;
    if (!image) throw new AdminApiError(404, "Immagine CRM non trovata.");
    const { error: storageError } = await supabase.storage.from(bucket).remove([image.storage_path]);
    if (storageError) throw storageError;
    const { error: deleteError } = await supabase.from("marketing_crm_property_images").delete().eq("id", image.id).eq("profile_id", profile.id);
    if (deleteError) throw deleteError;
    await writeAdminAuditLog({ supabase, request, actorProfileId: profile.id, isSuperAdmin, entityType: "marketing_crm_property_image", entityId: image.id, action: "deleted", before: { contactId: image.contact_id, fileName: image.original_name, byteSize: image.byte_size } });
    return NextResponse.json({ ok: true });
  } catch (error) { return adminApiErrorResponse(error); }
}

async function ensureContact(supabase: Awaited<ReturnType<typeof requireSuperAdmin>>["supabase"], contactId: string, profileId: string) {
  const { data, error } = await supabase.from("marketing_crm_contacts").select("id").eq("id", contactId).eq("profile_id", profileId).maybeSingle();
  if (error) throw error;
  if (!data) throw new AdminApiError(404, "Proprietario CRM non trovato.");
}

function cleanFileName(fileName: string) { return fileName.replace(/[\\/:*?"<>|]/g, "-").trim().slice(0, 255); }
