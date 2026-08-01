import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";

const percentage = z.number().min(0).max(1);
const nullableText = (max: number) => z.string().trim().max(max).nullable();
const estimateSchema = z.object({
  id: z.string().uuid().optional(),
  crmContactId: z.string().uuid().nullable(),
  ownerName: nullableText(180),
  propertyAddress: nullableText(280),
  city: nullableText(120),
  propertyType: nullableText(120),
  calculationMode: z.enum(["adr_occupancy", "annual_revenue"]),
  adrPerNight: z.number().min(0).nullable(),
  occupancyRate: percentage.nullable(),
  daysAvailable: z.number().int().min(1).max(366),
  annualGrossRevenueInput: z.number().min(0).nullable(),
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
  brandName: nullableText(140),
  headerText: nullableText(280),
  contactDetails: nullableText(1200),
  logoPath: nullableText(500),
  disclaimer: z.string().trim().min(20).max(2000),
}).superRefine((value, context) => {
  if (Math.abs(value.airbnbMixRate + value.bookingMixRate + value.directMixRate - 1) > 0.0001) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["airbnbMixRate"], message: "Il mix canali deve totalizzare il 100%." });
  }
  if (value.calculationMode === "adr_occupancy" && (value.adrPerNight === null || value.occupancyRate === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["adrPerNight"], message: "Inserisci ADR e tasso di occupazione." });
  }
  if (value.calculationMode === "annual_revenue" && value.annualGrossRevenueInput === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["annualGrossRevenueInput"], message: "Inserisci il fatturato lordo annuo." });
  }
});

export async function GET(request: NextRequest) {
  try {
    const { supabase, profile } = await requireSuperAdmin(request);
    const [estimates, contacts] = await Promise.all([
      supabase.from("marketing_revenue_estimates").select("*").eq("profile_id", profile.id).order("updated_at", { ascending: false }),
      supabase.from("marketing_crm_contacts").select("id, full_name, city, property_address, property_type").eq("profile_id", profile.id).order("updated_at", { ascending: false }).limit(250),
    ]);
    if (estimates.error) throw estimates.error;
    if (contacts.error) throw contacts.error;
    return NextResponse.json({ estimates: estimates.data, contacts: contacts.data });
  } catch (error) { return adminApiErrorResponse(error); }
}

export async function POST(request: NextRequest) { return saveEstimate(request, false); }
export async function PATCH(request: NextRequest) { return saveEstimate(request, true); }

async function saveEstimate(request: NextRequest, isUpdate: boolean) {
  try {
    const { supabase, profile, isSuperAdmin } = await requireSuperAdmin(request);
    const payload = estimateSchema.parse(await request.json());
    if (isUpdate && !payload.id) return NextResponse.json({ error: "Valutazione non trovata." }, { status: 400 });
    const calculation = calculate(payload);
    const values = {
      profile_id: profile.id,
      crm_contact_id: payload.crmContactId,
      owner_name: emptyToNull(payload.ownerName),
      property_address: emptyToNull(payload.propertyAddress),
      city: emptyToNull(payload.city),
      property_type: emptyToNull(payload.propertyType),
      calculation_mode: payload.calculationMode,
      adr_per_night: payload.calculationMode === "adr_occupancy" ? payload.adrPerNight : null,
      occupancy_rate: payload.calculationMode === "adr_occupancy" ? payload.occupancyRate : null,
      days_available: payload.daysAvailable,
      annual_gross_revenue_input: payload.calculationMode === "annual_revenue" ? payload.annualGrossRevenueInput : null,
      pm_fee_rate: payload.pmFeeRate, airbnb_mix_rate: payload.airbnbMixRate, booking_mix_rate: payload.bookingMixRate, direct_mix_rate: payload.directMixRate,
      airbnb_commission_rate: payload.airbnbCommissionRate, booking_commission_rate: payload.bookingCommissionRate, direct_commission_rate: payload.directCommissionRate,
      ota_vat_rate: payload.otaVatRate, pm_vat_rate: payload.pmVatRate, tax_rate: payload.taxRate,
      ota_cost_label: payload.otaCostLabel, management_cost_label: payload.managementCostLabel, tax_cost_label: payload.taxCostLabel,
      report_title: payload.reportTitle, brand_name: emptyToNull(payload.brandName), header_text: emptyToNull(payload.headerText), contact_details: emptyToNull(payload.contactDetails), logo_path: emptyToNull(payload.logoPath), disclaimer: payload.disclaimer,
      ...calculation,
    };
    const query = isUpdate
      ? supabase.from("marketing_revenue_estimates").update(values).eq("id", payload.id!).eq("profile_id", profile.id)
      : supabase.from("marketing_revenue_estimates").insert(values);
    const { data, error } = await query.select("*").single();
    if (error) throw error;
    await writeAdminAuditLog({ supabase, request, actorProfileId: profile.id, isSuperAdmin, entityType: "marketing_revenue_estimate", entityId: data.id, action: isUpdate ? "updated" : "created", after: { ownerName: data.owner_name, grossAnnualRevenue: data.gross_annual_revenue } });
    return NextResponse.json({ estimate: data, calculation });
  } catch (error) { return adminApiErrorResponse(error); }
}

function calculate(value: z.infer<typeof estimateSchema>) {
  const round = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;
  const effectiveOtaRate = value.airbnbMixRate * value.airbnbCommissionRate + value.bookingMixRate * value.bookingCommissionRate + value.directMixRate * value.directCommissionRate;
  const grossAnnualRevenue = value.calculationMode === "adr_occupancy"
    ? round((value.adrPerNight ?? 0) * (value.occupancyRate ?? 0) * value.daysAvailable)
    : round(value.annualGrossRevenueInput ?? 0);
  const otaCommissionNet = round(grossAnnualRevenue * effectiveOtaRate);
  const otaCommissionGross = round(otaCommissionNet * (1 + value.otaVatRate));
  const pmFeeBase = round(grossAnnualRevenue - otaCommissionGross);
  const pmFeeNet = round(pmFeeBase * value.pmFeeRate);
  const pmFeeGross = round(pmFeeNet * (1 + value.pmVatRate));
  const ownerPreTax = round(grossAnnualRevenue - otaCommissionGross - pmFeeGross);
  const taxAmount = round(ownerPreTax * value.taxRate);
  const ownerAnnualNet = round(ownerPreTax - taxAmount);
  return { effective_ota_rate: effectiveOtaRate, gross_annual_revenue: grossAnnualRevenue, ota_commission_net: otaCommissionNet, ota_commission_gross: otaCommissionGross, pm_fee_base: pmFeeBase, pm_fee_net: pmFeeNet, pm_fee_gross: pmFeeGross, owner_pre_tax: ownerPreTax, tax_amount: taxAmount, owner_annual_net: ownerAnnualNet, owner_monthly_net: round(ownerAnnualNet / 12) };
}

function emptyToNull(value: string | null) { return value?.trim() || null; }
