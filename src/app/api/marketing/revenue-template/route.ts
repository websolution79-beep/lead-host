import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";

const nullableText = (max: number) => z.string().trim().max(max).nullable();
const percentage = z.number().min(0).max(1);
const templateSchema = z.object({
  reportTitle: z.string().trim().min(2).max(140),
  brandName: nullableText(140),
  headerText: nullableText(280),
  contactDetails: nullableText(1200),
  logoPath: nullableText(500),
  daysAvailable: z.number().int().min(1).max(366),
  pmFeeRate: percentage,
  airbnbMixRate: percentage,
  bookingMixRate: percentage,
  directMixRate: percentage,
  airbnbCommissionRate: percentage,
  bookingCommissionRate: percentage,
  directCommissionRate: percentage,
  otaVatRate: percentage,
  pmVatRate: percentage,
  taxRate: percentage,
  otaCostLabel: z.string().trim().min(2).max(140),
  managementCostLabel: z.string().trim().min(2).max(140),
  taxCostLabel: z.string().trim().min(2).max(140),
  disclaimer: z.string().trim().min(20).max(2000),
}).superRefine((value, context) => {
  const mix = value.airbnbMixRate + value.bookingMixRate + value.directMixRate;
  if (Math.abs(mix - 1) > 0.0001) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["airbnbMixRate"], message: "Il mix canali deve totalizzare il 100%." });
  }
});

export async function GET(request: NextRequest) {
  try {
    const { supabase, profile } = await requireSuperAdmin(request);
    const template = await getOrCreateTemplate(supabase, profile.id);
    const signed = template.logo_path
      ? await supabase.storage.from("marketing-revenue-branding").createSignedUrl(template.logo_path, 3600)
      : null;
    if (signed?.error) throw signed.error;
    return NextResponse.json({ template, logoUrl: signed?.data?.signedUrl ?? null });
  } catch (error) { return adminApiErrorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile, isSuperAdmin } = await requireSuperAdmin(request);
    const payload = templateSchema.parse(await request.json());
    const template = await getOrCreateTemplate(supabase, profile.id);
    const { data: updated, error } = await supabase.from("marketing_revenue_templates").update({
      report_title: payload.reportTitle,
      brand_name: emptyToNull(payload.brandName),
      header_text: emptyToNull(payload.headerText),
      contact_details: emptyToNull(payload.contactDetails),
      logo_path: emptyToNull(payload.logoPath),
      days_available: payload.daysAvailable,
      pm_fee_rate: payload.pmFeeRate,
      airbnb_mix_rate: payload.airbnbMixRate,
      booking_mix_rate: payload.bookingMixRate,
      direct_mix_rate: payload.directMixRate,
      airbnb_commission_rate: payload.airbnbCommissionRate,
      booking_commission_rate: payload.bookingCommissionRate,
      direct_commission_rate: payload.directCommissionRate,
      ota_vat_rate: payload.otaVatRate,
      pm_vat_rate: payload.pmVatRate,
      tax_rate: payload.taxRate,
      ota_cost_label: payload.otaCostLabel,
      management_cost_label: payload.managementCostLabel,
      tax_cost_label: payload.taxCostLabel,
      disclaimer: payload.disclaimer,
    }).eq("id", template.id).eq("profile_id", profile.id).select("*").single();
    if (error) throw error;
    await writeAdminAuditLog({ supabase, request, actorProfileId: profile.id, isSuperAdmin, entityType: "marketing_revenue_template", entityId: updated.id, action: "updated", after: { reportTitle: updated.report_title } });
    return NextResponse.json({ template: updated });
  } catch (error) { return adminApiErrorResponse(error); }
}

async function getOrCreateTemplate(supabase: Awaited<ReturnType<typeof requireSuperAdmin>>["supabase"], profileId: string) {
  const current = await supabase.from("marketing_revenue_templates").select("*").eq("profile_id", profileId).maybeSingle();
  if (current.error) throw current.error;
  if (current.data) return current.data;
  const inserted = await supabase.from("marketing_revenue_templates").insert({ profile_id: profileId }).select("*").single();
  if (inserted.error && inserted.error.code !== "23505") throw inserted.error;
  if (inserted.data) return inserted.data;
  const retry = await supabase.from("marketing_revenue_templates").select("*").eq("profile_id", profileId).single();
  if (retry.error) throw retry.error;
  return retry.data;
}

function emptyToNull(value: string | null) { return value?.trim() || null; }
