import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { AdminApiError, adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import {
  MARKETPLACE_FINANCIAL_TEMPLATE_DEFAULTS,
  type MarketplaceFinancialTemplatePayload,
} from "@/lib/config/marketplace-financial-template";

const nullableText = (max: number) => z.string().trim().max(max).nullable();
const percentage = z.number().min(0).max(1);
const templateSchema = z
  .object({
    reportTitle: z.string().trim().min(2).max(140),
    brandName: z.string().trim().min(2).max(140),
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
  })
  .superRefine((value, context) => {
    const mix = value.airbnbMixRate + value.bookingMixRate + value.directMixRate;
    if (Math.abs(mix - 1) > 0.0001) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["airbnbMixRate"],
        message: "Il mix canali deve totalizzare il 100%.",
      });
    }
  });

export async function GET(request: NextRequest) {
  try {
    const { supabase, isSuperAdmin } = await requireSuperAdmin(request);
    if (!isSuperAdmin) throw new AdminApiError(403, "Configurazione riservata ai Super Admin.");

    const template = await getTemplate(supabase);
    const signed = template.logo_path
      ? await supabase.storage
          .from("marketplace-financial-branding")
          .createSignedUrl(template.logo_path, 3600)
      : null;
    if (signed?.error) throw signed.error;

    return NextResponse.json(
      { template, logoUrl: signed?.data?.signedUrl ?? null },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile, isSuperAdmin } = await requireSuperAdmin(request);
    if (!isSuperAdmin) throw new AdminApiError(403, "Configurazione riservata ai Super Admin.");

    const payload = templateSchema.parse(await request.json());
    const previous = await getTemplate(supabase);
    const { data: template, error } = await supabase
      .from("marketplace_financial_templates")
      .update(toDatabasePayload(payload))
      .eq("key", "default")
      .select("*")
      .single();
    if (error) throw error;

    revalidatePath("/admin/impostazioni");
    await writeAdminAuditLog({
      supabase,
      request,
      actorProfileId: profile.id,
      isSuperAdmin,
      entityType: "marketplace_financial_template",
      entityId: "default",
      action: "updated",
      before: toDatabasePayload(toPayload(previous)),
      after: toDatabasePayload(payload),
    });

    return NextResponse.json({ template });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

async function getTemplate(
  supabase: Awaited<ReturnType<typeof requireSuperAdmin>>["supabase"],
) {
  const current = await supabase
    .from("marketplace_financial_templates")
    .select("*")
    .eq("key", "default")
    .maybeSingle();
  if (current.error) throw current.error;
  if (current.data) return current.data;

  const inserted = await supabase
    .from("marketplace_financial_templates")
    .insert({ key: "default", ...toDatabasePayload(MARKETPLACE_FINANCIAL_TEMPLATE_DEFAULTS) })
    .select("*")
    .single();
  if (inserted.error && inserted.error.code !== "23505") throw inserted.error;
  if (inserted.data) return inserted.data;

  const retry = await supabase
    .from("marketplace_financial_templates")
    .select("*")
    .eq("key", "default")
    .single();
  if (retry.error) throw retry.error;
  return retry.data;
}

function toPayload(template: {
  report_title: string;
  brand_name: string;
  header_text: string | null;
  contact_details: string | null;
  logo_path: string | null;
  days_available: number;
  pm_fee_rate: number;
  airbnb_mix_rate: number;
  booking_mix_rate: number;
  direct_mix_rate: number;
  airbnb_commission_rate: number;
  booking_commission_rate: number;
  direct_commission_rate: number;
  ota_vat_rate: number;
  pm_vat_rate: number;
  tax_rate: number;
  ota_cost_label: string;
  management_cost_label: string;
  tax_cost_label: string;
  disclaimer: string;
}): MarketplaceFinancialTemplatePayload {
  return {
    reportTitle: template.report_title,
    brandName: template.brand_name,
    headerText: template.header_text,
    contactDetails: template.contact_details,
    logoPath: template.logo_path,
    daysAvailable: template.days_available,
    pmFeeRate: template.pm_fee_rate,
    airbnbMixRate: template.airbnb_mix_rate,
    bookingMixRate: template.booking_mix_rate,
    directMixRate: template.direct_mix_rate,
    airbnbCommissionRate: template.airbnb_commission_rate,
    bookingCommissionRate: template.booking_commission_rate,
    directCommissionRate: template.direct_commission_rate,
    otaVatRate: template.ota_vat_rate,
    pmVatRate: template.pm_vat_rate,
    taxRate: template.tax_rate,
    otaCostLabel: template.ota_cost_label,
    managementCostLabel: template.management_cost_label,
    taxCostLabel: template.tax_cost_label,
    disclaimer: template.disclaimer,
  };
}

function toDatabasePayload(payload: MarketplaceFinancialTemplatePayload) {
  return {
    report_title: payload.reportTitle,
    brand_name: payload.brandName,
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
  };
}

function emptyToNull(value: string | null) {
  return value?.trim() || null;
}
