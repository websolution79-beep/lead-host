import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  adminApiErrorResponse,
  AdminApiError,
} from "@/lib/admin/auth";
import { requireMarketingAddonAccess } from "@/lib/addons/access";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { createRevenueEstimatePdf } from "../pdf/route";

export const runtime = "nodejs";

const bucket = "marketing-crm-documents";
const requestSchema = z
  .object({
    contactId: z.string().uuid().optional(),
    createContact: z.boolean().optional().default(false),
  })
  .refine((value) => Boolean(value.contactId) !== value.createContact, {
    message: "Scegli una scheda CRM oppure creane una nuova.",
  });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ estimateId: string }> },
) {
  try {
    const { estimateId } = await params;
    const { supabase, profile, isSuperAdmin } =
      await requireMarketingAddonAccess(request);
    const payload = requestSchema.parse(await request.json());
    const { data: estimate, error: estimateError } = await supabase
      .from("marketing_revenue_estimates")
      .select("*")
      .eq("id", estimateId)
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (estimateError) throw estimateError;
    if (!estimate) throw new AdminApiError(404, "Valutazione non trovata.");

    const contact = payload.createContact
      ? await createCrmContact(supabase, profile.id, estimate)
      : await getCrmContact(supabase, profile.id, payload.contactId!);

    const { data: template, error: templateError } = await supabase
      .from("marketing_revenue_templates")
      .select("brand_name, header_text, contact_details, logo_path")
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (templateError) throw templateError;
    const identity = {
      brandName: estimate.brand_name ?? template?.brand_name ?? null,
      headerText: estimate.header_text ?? template?.header_text ?? null,
      contactDetails:
        estimate.contact_details ?? template?.contact_details ?? null,
      logoPath: estimate.logo_path ?? template?.logo_path ?? null,
    };
    let logoBuffer: Buffer | null = null;
    if (identity.logoPath) {
      const logo = await supabase.storage
        .from("marketing-revenue-branding")
        .download(identity.logoPath);
      if (!logo.error) logoBuffer = Buffer.from(await logo.data.arrayBuffer());
    }

    const pdf = await createRevenueEstimatePdf(estimate, identity, logoBuffer);
    const storagePath = `${profile.id}/${contact.id}/revenue-estimates/${estimate.id}.pdf`;
    const fileName = `Rendita-stimata-${slug(estimate.owner_name || "immobile")}-${dateStamp()}.pdf`;
    const { data: existingDocument, error: existingError } = await supabase
      .from("marketing_crm_documents")
      .select("id")
      .eq("storage_path", storagePath)
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existingDocument) {
      const { count, error: countError } = await supabase
        .from("marketing_crm_documents")
        .select("id", { count: "exact", head: true })
        .eq("contact_id", contact.id)
        .eq("profile_id", profile.id);
      if (countError) throw countError;
      if ((count ?? 0) >= 10) {
        throw new AdminApiError(
          422,
          "La scheda CRM ha gia raggiunto il limite di 10 documenti.",
        );
      }
    }

    const upload = await supabase.storage
      .from(bucket)
      .upload(storagePath, pdf, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (upload.error) throw upload.error;

    const documentValues = {
      profile_id: profile.id,
      contact_id: contact.id,
      storage_path: storagePath,
      original_name: fileName,
      content_type: "application/pdf",
      byte_size: pdf.byteLength,
      created_at: new Date().toISOString(),
    };
    const documentResult = existingDocument
      ? await supabase
          .from("marketing_crm_documents")
          .update(documentValues)
          .eq("id", existingDocument.id)
          .eq("profile_id", profile.id)
          .select("*")
          .single()
      : await supabase
          .from("marketing_crm_documents")
          .insert(documentValues)
          .select("*")
          .single();
    if (documentResult.error) {
      if (!existingDocument)
        await supabase.storage.from(bucket).remove([storagePath]);
      throw documentResult.error;
    }

    const { error: linkError } = await supabase
      .from("marketing_revenue_estimates")
      .update({ crm_contact_id: contact.id })
      .eq("id", estimate.id)
      .eq("profile_id", profile.id);
    if (linkError) throw linkError;

    await writeAdminAuditLog({
      supabase,
      request,
      actorProfileId: profile.id,
      isSuperAdmin,
      actorRole: isSuperAdmin ? "super_admin" : "property_manager",
      entityType: "marketing_crm_document",
      entityId: documentResult.data.id,
      action: existingDocument
        ? "revenue_estimate_pdf.updated"
        : "revenue_estimate_pdf.attached",
      after: {
        estimateId: estimate.id,
        contactId: contact.id,
        fileName,
      },
    });

    return NextResponse.json({
      contact,
      document: documentResult.data,
      replaced: Boolean(existingDocument),
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

async function getCrmContact(
  supabase: Awaited<ReturnType<typeof requireMarketingAddonAccess>>["supabase"],
  profileId: string,
  contactId: string,
) {
  const { data, error } = await supabase
    .from("marketing_crm_contacts")
    .select("id, full_name, city, property_address, property_type")
    .eq("id", contactId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AdminApiError(404, "Scheda CRM non trovata.");
  return data;
}

async function createCrmContact(
  supabase: Awaited<ReturnType<typeof requireMarketingAddonAccess>>["supabase"],
  profileId: string,
  estimate: Record<string, unknown>,
) {
  const { data: pipeline, error: pipelineError } = await supabase
    .from("marketing_crm_pipelines")
    .select("id")
    .eq("profile_id", profileId)
    .eq("is_default", true)
    .maybeSingle();
  if (pipelineError) throw pipelineError;
  if (!pipeline) {
    throw new AdminApiError(
      422,
      "Pipeline CRM non disponibile. Apri prima la pagina CRM e riprova.",
    );
  }
  const { data: stage, error: stageError } = await supabase
    .from("marketing_crm_stages")
    .select("id")
    .eq("pipeline_id", pipeline.id)
    .order("position")
    .limit(1)
    .maybeSingle();
  if (stageError) throw stageError;
  if (!stage)
    throw new AdminApiError(422, "La pipeline CRM non contiene stage.");
  const { data: lastContact, error: positionError } = await supabase
    .from("marketing_crm_contacts")
    .select("position")
    .eq("profile_id", profileId)
    .eq("stage_id", stage.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (positionError) throw positionError;
  const fullName = cleanText(estimate.owner_name) || "Nuovo proprietario";
  const { data, error } = await supabase
    .from("marketing_crm_contacts")
    .insert({
      profile_id: profileId,
      pipeline_id: pipeline.id,
      stage_id: stage.id,
      full_name: fullName,
      property_address: cleanText(estimate.property_address),
      property_type: cleanText(estimate.property_type),
      city: cleanText(estimate.city),
      position: (lastContact?.position ?? -1) + 1,
    })
    .select("id, full_name, city, property_address, property_type")
    .single();
  if (error) throw error;
  return data;
}

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function slug(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "immobile"
  );
}
