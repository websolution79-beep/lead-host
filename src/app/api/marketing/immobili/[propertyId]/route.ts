import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminApiErrorResponse, AdminApiError } from "@/lib/admin/auth";
import { requireMarketingAddonAccess } from "@/lib/addons/access";
import { writeAdminAuditLog } from "@/lib/admin/audit";

const nullable = (max: number) => z.string().trim().max(max).nullable();
const nullableInt = (min: number, max: number) => z.number().int().min(min).max(max).nullable();
const propertySchema = z.object({
  name: z.string().trim().min(2).max(140), propertyType: nullable(80), propertyAddress: nullable(300),
  region: nullable(100), province: nullable(100), city: nullable(120), bedrooms: nullableInt(0, 99),
  bathrooms: nullableInt(0, 99), beds: nullableInt(0, 99), areaSqm: nullableInt(1, 100000),
  ownerFullName: nullable(140), ownerEmail: z.string().trim().email().max(255).nullable(), ownerPhone: nullable(50),
  ownerNotes: nullable(5000), operationalNotes: nullable(5000),
});
const contactSchema = z.object({ serviceType: z.string().trim().min(2).max(100), name: nullable(140), companyName: nullable(160), phone: nullable(50), email: z.string().trim().email().max(255).nullable(), whatsapp: nullable(50), notes: nullable(5000) });
const otaSchema = z.object({ label: z.string().trim().min(2).max(80), url: z.string().trim().min(3).max(2048) });
const maintenanceSchema = z.object({ happenedAt: z.string().date(), category: z.string().trim().min(2).max(100), title: z.string().trim().min(2).max(180), description: nullable(5000), supplierName: nullable(160), costCents: nullableInt(0, 100000000), nextDueAt: z.string().date().nullable() });
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update_property"), property: propertySchema }),
  z.object({ action: z.literal("create_contact"), contact: contactSchema }),
  z.object({ action: z.literal("update_contact"), contactId: z.string().uuid(), contact: contactSchema }),
  z.object({ action: z.literal("delete_contact"), contactId: z.string().uuid() }),
  z.object({ action: z.literal("create_ota"), ota: otaSchema }),
  z.object({ action: z.literal("update_ota"), otaId: z.string().uuid(), ota: otaSchema }),
  z.object({ action: z.literal("delete_ota"), otaId: z.string().uuid() }),
  z.object({ action: z.literal("create_maintenance"), maintenance: maintenanceSchema }),
  z.object({ action: z.literal("update_maintenance"), maintenanceId: z.string().uuid(), maintenance: maintenanceSchema }),
  z.object({ action: z.literal("delete_maintenance"), maintenanceId: z.string().uuid() }),
]);

export async function GET(request: NextRequest, { params }: { params: Promise<{ propertyId: string }> }) {
  try {
    const { supabase, profile } = await requireMarketingAddonAccess(request);
    const { propertyId } = await params;
    return NextResponse.json(await getPropertyPayload(supabase, profile.id, propertyId));
  } catch (error) { return adminApiErrorResponse(error); }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ propertyId: string }> }) {
  try {
    const { supabase, profile, isSuperAdmin } = await requireMarketingAddonAccess(request);
    const { propertyId } = await params;
    await ensureProperty(supabase, propertyId, profile.id);
    const payload = actionSchema.parse(await request.json());
    let entityType = "marketing_managed_property";
    let entityId: string | null = propertyId;

    if (payload.action === "update_property") {
      const p = payload.property;
      const { error } = await supabase.from("marketing_managed_properties").update({
        name: p.name, property_type: nullIfEmpty(p.propertyType), property_address: nullIfEmpty(p.propertyAddress), region: nullIfEmpty(p.region), province: nullIfEmpty(p.province), city: nullIfEmpty(p.city), bedrooms: p.bedrooms, bathrooms: p.bathrooms, beds: p.beds, area_sqm: p.areaSqm, owner_full_name: nullIfEmpty(p.ownerFullName), owner_email: nullIfEmpty(p.ownerEmail), owner_phone: nullIfEmpty(p.ownerPhone), owner_notes: nullIfEmpty(p.ownerNotes), operational_notes: nullIfEmpty(p.operationalNotes),
      }).eq("id", propertyId).eq("profile_id", profile.id);
      if (error) throw error;
    }
    if (payload.action === "create_contact") {
      const count = await nextPosition(supabase, "marketing_managed_property_contacts", propertyId, profile.id);
      const { data, error } = await supabase.from("marketing_managed_property_contacts").insert({ property_id: propertyId, profile_id: profile.id, service_type: payload.contact.serviceType, name: nullIfEmpty(payload.contact.name), company_name: nullIfEmpty(payload.contact.companyName), phone: nullIfEmpty(payload.contact.phone), email: nullIfEmpty(payload.contact.email), whatsapp: nullIfEmpty(payload.contact.whatsapp), notes: nullIfEmpty(payload.contact.notes), position: count }).select("id").single();
      if (error) throw error; entityType = "marketing_managed_property_contact"; entityId = data.id;
    }
    if (payload.action === "update_contact") {
      const c = payload.contact; const { error } = await supabase.from("marketing_managed_property_contacts").update({ service_type: c.serviceType, name: nullIfEmpty(c.name), company_name: nullIfEmpty(c.companyName), phone: nullIfEmpty(c.phone), email: nullIfEmpty(c.email), whatsapp: nullIfEmpty(c.whatsapp), notes: nullIfEmpty(c.notes) }).eq("id", payload.contactId).eq("property_id", propertyId).eq("profile_id", profile.id); if (error) throw error; entityType = "marketing_managed_property_contact"; entityId = payload.contactId;
    }
    if (payload.action === "delete_contact") { const { error } = await supabase.from("marketing_managed_property_contacts").delete().eq("id", payload.contactId).eq("property_id", propertyId).eq("profile_id", profile.id); if (error) throw error; entityType = "marketing_managed_property_contact"; entityId = payload.contactId; }
    if (payload.action === "create_ota") {
      const url = normalizeOtaUrl(payload.ota.url);
      const count = await nextPosition(supabase, "marketing_managed_property_ota_links", propertyId, profile.id);
      const { data, error } = await supabase.from("marketing_managed_property_ota_links").insert({ property_id: propertyId, profile_id: profile.id, label: payload.ota.label, url, position: count }).select("id").single(); if (error) throw error; entityType = "marketing_managed_property_ota"; entityId = data.id;
    }
    if (payload.action === "update_ota") { const url = normalizeOtaUrl(payload.ota.url); const { error } = await supabase.from("marketing_managed_property_ota_links").update({ label: payload.ota.label, url }).eq("id", payload.otaId).eq("property_id", propertyId).eq("profile_id", profile.id); if (error) throw error; entityType = "marketing_managed_property_ota"; entityId = payload.otaId; }
    if (payload.action === "delete_ota") { const { error } = await supabase.from("marketing_managed_property_ota_links").delete().eq("id", payload.otaId).eq("property_id", propertyId).eq("profile_id", profile.id); if (error) throw error; entityType = "marketing_managed_property_ota"; entityId = payload.otaId; }
    if (payload.action === "create_maintenance") {
      const m = payload.maintenance; const { data, error } = await supabase.from("marketing_managed_property_maintenance").insert({ property_id: propertyId, profile_id: profile.id, happened_at: m.happenedAt, category: m.category, title: m.title, description: nullIfEmpty(m.description), supplier_name: nullIfEmpty(m.supplierName), cost_cents: m.costCents, next_due_at: m.nextDueAt }).select("id").single(); if (error) throw error; entityType = "marketing_managed_property_maintenance"; entityId = data.id;
    }
    if (payload.action === "update_maintenance") { const m = payload.maintenance; const { error } = await supabase.from("marketing_managed_property_maintenance").update({ happened_at: m.happenedAt, category: m.category, title: m.title, description: nullIfEmpty(m.description), supplier_name: nullIfEmpty(m.supplierName), cost_cents: m.costCents, next_due_at: m.nextDueAt }).eq("id", payload.maintenanceId).eq("property_id", propertyId).eq("profile_id", profile.id); if (error) throw error; entityType = "marketing_managed_property_maintenance"; entityId = payload.maintenanceId; }
    if (payload.action === "delete_maintenance") { const { error } = await supabase.from("marketing_managed_property_maintenance").delete().eq("id", payload.maintenanceId).eq("property_id", propertyId).eq("profile_id", profile.id); if (error) throw error; entityType = "marketing_managed_property_maintenance"; entityId = payload.maintenanceId; }

    await writeAdminAuditLog({ supabase, request, actorProfileId: profile.id, isSuperAdmin, actorRole: isSuperAdmin ? "super_admin" : "property_manager", entityType, entityId, action: `marketing.managed_property.${payload.action}`, after: { propertyId } });
    return NextResponse.json(await getPropertyPayload(supabase, profile.id, propertyId));
  } catch (error) { if (error instanceof z.ZodError) return NextResponse.json({ error: "Controlla i dati inseriti e riprova." }, { status: 422 }); return adminApiErrorResponse(error); }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ propertyId: string }> }) {
  try {
    const { supabase, profile, isSuperAdmin } = await requireMarketingAddonAccess(request); const { propertyId } = await params;
    const payload = await getPropertyPayload(supabase, profile.id, propertyId);
    const paths = [payload.property.cover_image_path, ...payload.documents.map((document) => document.storage_path)].filter((value): value is string => Boolean(value));
    if (paths.length) { const coverPaths = paths.filter((path) => path.startsWith(`${profile.id}/${propertyId}/cover/`)); const documentPaths = paths.filter((path) => !coverPaths.includes(path)); if (coverPaths.length) await supabase.storage.from("marketing-managed-property-covers").remove(coverPaths); if (documentPaths.length) await supabase.storage.from("marketing-managed-property-documents").remove(documentPaths); }
    const { error } = await supabase.from("marketing_managed_properties").delete().eq("id", propertyId).eq("profile_id", profile.id); if (error) throw error;
    await writeAdminAuditLog({ supabase, request, actorProfileId: profile.id, isSuperAdmin, actorRole: isSuperAdmin ? "super_admin" : "property_manager", entityType: "marketing_managed_property", entityId: propertyId, action: "deleted", before: { name: payload.property.name } });
    return NextResponse.json({ ok: true });
  } catch (error) { return adminApiErrorResponse(error); }
}

export async function getPropertyPayload(supabase: Awaited<ReturnType<typeof requireMarketingAddonAccess>>["supabase"], profileId: string, propertyId: string) {
  const property = await ensureProperty(supabase, propertyId, profileId);
  const [contactsResult, otaResult, maintenanceResult, documentsResult] = await Promise.all([
    supabase.from("marketing_managed_property_contacts").select("*").eq("property_id", propertyId).eq("profile_id", profileId).order("position").order("created_at"),
    supabase.from("marketing_managed_property_ota_links").select("*").eq("property_id", propertyId).eq("profile_id", profileId).order("position").order("created_at"),
    supabase.from("marketing_managed_property_maintenance").select("*").eq("property_id", propertyId).eq("profile_id", profileId).order("happened_at", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("marketing_managed_property_documents").select("*").eq("property_id", propertyId).eq("profile_id", profileId).order("created_at", { ascending: false }),
  ]);
  if (contactsResult.error) throw contactsResult.error; if (otaResult.error) throw otaResult.error; if (maintenanceResult.error) throw maintenanceResult.error; if (documentsResult.error) throw documentsResult.error;
  const [coverSigned, documents] = await Promise.all([
    property.cover_image_path ? supabase.storage.from("marketing-managed-property-covers").createSignedUrl(property.cover_image_path, 300) : Promise.resolve(null),
    Promise.all((documentsResult.data ?? []).map(async (document) => { const signed = await supabase.storage.from("marketing-managed-property-documents").createSignedUrl(document.storage_path, 300, { download: document.original_name }); return { ...document, download_url: signed.data?.signedUrl ?? null }; })),
  ]);
  return { property: { ...property, cover_image_url: coverSigned?.data?.signedUrl ?? null }, contacts: contactsResult.data ?? [], otaLinks: otaResult.data ?? [], maintenance: maintenanceResult.data ?? [], documents };
}

async function ensureProperty(supabase: Awaited<ReturnType<typeof requireMarketingAddonAccess>>["supabase"], propertyId: string, profileId: string) {
  if (!z.string().uuid().safeParse(propertyId).success) throw new AdminApiError(404, "Immobile non trovato.");
  const { data, error } = await supabase.from("marketing_managed_properties").select("*").eq("id", propertyId).eq("profile_id", profileId).maybeSingle(); if (error) throw error; if (!data) throw new AdminApiError(404, "Immobile non trovato."); return data;
}
async function nextPosition(supabase: Awaited<ReturnType<typeof requireMarketingAddonAccess>>["supabase"], table: "marketing_managed_property_contacts" | "marketing_managed_property_ota_links", propertyId: string, profileId: string) { const { data, error } = await supabase.from(table).select("position").eq("property_id", propertyId).eq("profile_id", profileId).order("position", { ascending: false }).limit(1); if (error) throw error; return (data?.[0]?.position ?? -1) + 1; }
function nullIfEmpty(value: string | null) { return value?.trim() || null; }
function normalizeOtaUrl(value: string) { const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`; try { const parsed = new URL(candidate); if (!/^https?:$/i.test(parsed.protocol)) throw new Error("Protocollo non valido"); return parsed.toString(); } catch { throw new AdminApiError(422, "Inserisci un link OTA valido, ad esempio https://www.airbnb.it/…"); } }
