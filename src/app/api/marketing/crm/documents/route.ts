import { randomUUID } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminApiErrorResponse, AdminApiError } from "@/lib/admin/auth";
import { requireMarketingAddonAccess } from "@/lib/addons/access";
import { writeAdminAuditLog } from "@/lib/admin/audit";

const bucket = "marketing-crm-documents";
const maxDocumentBytes = 10 * 1024 * 1024;
const allowedTypes = new Map([
  ["application/pdf", "pdf"],
  ["application/msword", "doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
]);

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_upload"),
    contactId: z.string().uuid(),
    fileName: z.string().trim().min(1).max(255),
    contentType: z.string(),
    byteSize: z.number().int().positive().max(maxDocumentBytes),
  }),
  z.object({
    action: z.literal("complete_upload"),
    contactId: z.string().uuid(),
    storagePath: z.string().min(1).max(500),
    fileName: z.string().trim().min(1).max(255),
    contentType: z.string(),
    byteSize: z.number().int().positive().max(maxDocumentBytes),
  }),
  z.object({
    action: z.literal("delete_document"),
    documentId: z.string().uuid(),
  }),
]);

export async function GET(request: NextRequest) {
  try {
    const { supabase, profile } = await requireMarketingAddonAccess(request);
    const contactId = z.string().uuid().parse(request.nextUrl.searchParams.get("contactId"));
    await ensureContact(supabase, contactId, profile.id);

    const { data, error } = await supabase
      .from("marketing_crm_documents")
      .select("*")
      .eq("contact_id", contactId)
      .eq("profile_id", profile.id)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const documents = await Promise.all(
      (data ?? []).map(async (document) => {
        const signed = await supabase.storage.from(bucket).createSignedUrl(document.storage_path, 300, {
          download: document.original_name,
        });
        if (signed.error || !signed.data?.signedUrl) throw signed.error ?? new Error("Link documento non disponibile.");
        return { ...document, download_url: signed.data.signedUrl };
      }),
    );

    return NextResponse.json({ documents });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile, isSuperAdmin } = await requireMarketingAddonAccess(request);
    const payload = actionSchema.parse(await request.json());

    if (payload.action === "create_upload") {
      await ensureContact(supabase, payload.contactId, profile.id);
      const extension = allowedTypes.get(payload.contentType);
      if (!extension) throw new AdminApiError(422, "Sono ammessi solo PDF, DOC e DOCX.");

      const { count, error: countError } = await supabase
        .from("marketing_crm_documents")
        .select("id", { count: "exact", head: true })
        .eq("contact_id", payload.contactId)
        .eq("profile_id", profile.id);
      if (countError) throw countError;
      if ((count ?? 0) >= 10) {
        throw new AdminApiError(422, "Puoi allegare al massimo 10 documenti per proprietario.");
      }

      const storagePath = `${profile.id}/${payload.contactId}/${randomUUID()}.${extension}`;
      const signed = await supabase.storage.from(bucket).createSignedUploadUrl(storagePath);
      if (signed.error || !signed.data) throw signed.error ?? new Error("Upload documento non disponibile.");

      return NextResponse.json({ storagePath, token: signed.data.token });
    }

    if (payload.action === "complete_upload") {
      await ensureContact(supabase, payload.contactId, profile.id);
      const extension = allowedTypes.get(payload.contentType);
      if (!extension) throw new AdminApiError(422, "Formato documento non valido.");
      if (!payload.storagePath.startsWith(`${profile.id}/${payload.contactId}/`)) {
        throw new AdminApiError(422, "Percorso documento non valido.");
      }

      const { data: document, error } = await supabase
        .from("marketing_crm_documents")
        .insert({
          profile_id: profile.id,
          contact_id: payload.contactId,
          storage_path: payload.storagePath,
          original_name: cleanFileName(payload.fileName),
          content_type: payload.contentType,
          byte_size: payload.byteSize,
        })
        .select("*")
        .single();
      if (error) throw error;

      await writeAdminAuditLog({
        supabase,
        request,
        actorProfileId: profile.id,
        isSuperAdmin,
        actorRole: isSuperAdmin ? "super_admin" : "property_manager",
        entityType: "marketing_crm_document",
        entityId: document.id,
        action: "uploaded",
        after: { contactId: payload.contactId, fileName: document.original_name, byteSize: document.byte_size },
      });
      return NextResponse.json({ document });
    }

    const { data: document, error: documentError } = await supabase
      .from("marketing_crm_documents")
      .select("*")
      .eq("id", payload.documentId)
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (documentError) throw documentError;
    if (!document) throw new AdminApiError(404, "Documento CRM non trovato.");

    const { error: storageError } = await supabase.storage.from(bucket).remove([document.storage_path]);
    if (storageError) throw storageError;
    const { error: deleteError } = await supabase
      .from("marketing_crm_documents")
      .delete()
      .eq("id", document.id)
      .eq("profile_id", profile.id);
    if (deleteError) throw deleteError;

    await writeAdminAuditLog({
      supabase,
      request,
      actorProfileId: profile.id,
      isSuperAdmin,
      actorRole: isSuperAdmin ? "super_admin" : "property_manager",
      entityType: "marketing_crm_document",
      entityId: document.id,
      action: "deleted",
      before: { contactId: document.contact_id, fileName: document.original_name, byteSize: document.byte_size },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

async function ensureContact(
  supabase: Awaited<ReturnType<typeof requireMarketingAddonAccess>>["supabase"],
  contactId: string,
  profileId: string,
) {
  const { data, error } = await supabase
    .from("marketing_crm_contacts")
    .select("id")
    .eq("id", contactId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AdminApiError(404, "Proprietario CRM non trovato.");
}

function cleanFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|]/g, "-").trim().slice(0, 255);
}
