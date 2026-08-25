import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import {
  MARKETPLACE_FINANCIAL_TEMPLATE_DEFAULTS,
  type MarketplaceFinancialTemplatePayload,
} from "@/lib/config/marketplace-financial-template";
import { calculateRevenueEstimate } from "@/lib/financial/revenue-calculation";

type RouteContext = {
  params: Promise<{ ownerRequestId: string }>;
};

const percentage = z.number().min(0).max(1);
const nullableText = (max: number) => z.string().trim().max(max).nullable();
const estimateSchema = z
  .object({
    adrPerNight: z.number().min(0).max(100000),
    occupancyRate: percentage,
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
    reportTitle: z.string().trim().min(2).max(140),
    brandName: z.string().trim().min(2).max(140),
    headerText: nullableText(280),
    contactDetails: nullableText(1200),
    logoPath: nullableText(500),
    disclaimer: z.string().trim().min(20).max(2000),
    isVisible: z.boolean(),
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

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { ownerRequestId } = await context.params;
    const { supabase } = await requireSuperAdmin(request);
    const lead = await getLead(supabase, ownerRequestId);

    const [estimateResult, template] = await Promise.all([
      supabase
        .from("marketplace_financial_estimates")
        .select("*")
        .eq("owner_request_id", ownerRequestId)
        .maybeSingle(),
      getTemplate(supabase),
    ]);
    if (estimateResult.error) throw estimateResult.error;

    const logoPath = estimateResult.data?.logo_path ?? template.logo_path;
    const signedLogo = logoPath
      ? await supabase.storage
          .from("marketplace-financial-branding")
          .createSignedUrl(logoPath, 3600)
      : null;
    if (signedLogo?.error) throw signedLogo.error;

    return NextResponse.json(
      {
        leadId: lead?.id ?? null,
        estimate: estimateResult.data,
        template,
        logoUrl: signedLogo?.data?.signedUrl ?? null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return financialEstimateErrorResponse(error);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { ownerRequestId } = await context.params;
    const payload = estimateSchema.parse(await request.json());
    const { supabase, profile, isSuperAdmin } = await requireSuperAdmin(request);
    const lead = await getLead(supabase, ownerRequestId);

    const existing = await supabase
      .from("marketplace_financial_estimates")
      .select("*")
      .eq("owner_request_id", ownerRequestId)
      .maybeSingle();
    if (existing.error) throw existing.error;

    const calculated = calculateRevenueEstimate({
      calculationMode: "adr_occupancy",
      adrPerNight: payload.adrPerNight,
      occupancyRate: payload.occupancyRate,
      daysAvailable: payload.daysAvailable,
      pmFeeRate: payload.pmFeeRate,
      airbnbMixRate: payload.airbnbMixRate,
      bookingMixRate: payload.bookingMixRate,
      directMixRate: payload.directMixRate,
      airbnbCommissionRate: payload.airbnbCommissionRate,
      bookingCommissionRate: payload.bookingCommissionRate,
      directCommissionRate: payload.directCommissionRate,
      otaVatRate: payload.otaVatRate,
      pmVatRate: payload.pmVatRate,
      taxRate: payload.taxRate,
    });
    const values = {
      is_visible: payload.isVisible,
      adr_per_night: payload.adrPerNight,
      occupancy_rate: payload.occupancyRate,
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
      report_title: payload.reportTitle,
      brand_name: payload.brandName,
      header_text: emptyToNull(payload.headerText),
      contact_details: emptyToNull(payload.contactDetails),
      logo_path: emptyToNull(payload.logoPath),
      disclaimer: payload.disclaimer,
      ...calculated,
    };

    const saved = existing.data
      ? await supabase
          .from("marketplace_financial_estimates")
          .update(values)
          .eq("id", existing.data.id)
          .select("*")
          .single()
      : await supabase
          .from("marketplace_financial_estimates")
          .insert({
            lead_id: lead?.id ?? null,
            owner_request_id: ownerRequestId,
            created_by_profile_id: profile.id,
            ...values,
          })
          .select("*")
          .single();
    if (saved.error) throw saved.error;

    await writeAdminAuditLog({
      supabase,
      request,
      actorProfileId: profile.id,
      isSuperAdmin,
      entityType: "marketplace_financial_estimate",
      entityId: saved.data.id,
      action: existing.data ? "updated" : "created",
      before: existing.data
        ? {
            adr_per_night: existing.data.adr_per_night,
            occupancy_rate: existing.data.occupancy_rate,
            owner_annual_net: existing.data.owner_annual_net,
          }
        : null,
      after: {
        adr_per_night: saved.data.adr_per_night,
        occupancy_rate: saved.data.occupancy_rate,
        owner_annual_net: saved.data.owner_annual_net,
      },
    });

    return NextResponse.json({ estimate: saved.data });
  } catch (error) {
    return financialEstimateErrorResponse(error);
  }
}

async function getLead(
  supabase: Awaited<ReturnType<typeof requireSuperAdmin>>["supabase"],
  ownerRequestId: string,
) {
  const result = await supabase
    .from("leads")
    .select("id")
    .eq("owner_request_id", ownerRequestId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data;
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
  if (inserted.error) throw inserted.error;
  return inserted.data;
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

function financialEstimateErrorResponse(error: unknown) {
  if (isMissingOwnerRequestIdColumn(error)) {
    return NextResponse.json(
      {
        error:
          "Database non aggiornato per le bozze della stima Marketplace. Applica la migration e riprova.",
      },
      { status: 409 },
    );
  }
  return adminApiErrorResponse(error);
}

function isMissingOwnerRequestIdColumn(error: unknown) {
  const databaseError = error as { code?: string; message?: string } | null;
  return (
    databaseError?.code === "42703" ||
    databaseError?.code === "PGRST204" ||
    Boolean(databaseError?.message?.includes("owner_request_id"))
  );
}
