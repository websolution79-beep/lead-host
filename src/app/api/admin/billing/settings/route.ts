import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import {
  fetchBillingIssuerSettings,
  saveBillingIssuerSettings,
} from "@/lib/billing/invoice-settings";
import {
  isValidItalianFiscalCode,
  isValidItalianVatNumber,
} from "@/lib/billing/fiscal-validation";

const settingsSchema = z.object({
  legalName: z.string().trim().min(2).max(160),
  vatCountryCode: z.literal("IT"),
  vatNumber: z.string().trim().refine(isValidItalianVatNumber),
  fiscalCode: z.string().trim().refine(isValidItalianFiscalCode),
  addressLine: z.string().trim().min(2).max(180),
  postalCode: z.string().trim().regex(/^\d{5}$/),
  city: z.string().trim().min(2).max(100),
  province: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  country: z.literal("IT"),
  email: z.string().trim().email(),
  taxRegime: z.literal("RF19"),
  taxRegimeDescription: z.string().trim().min(10).max(500),
  vatRate: z.literal(0),
  vatNature: z.literal("N2.2"),
  vatReference: z.string().trim().min(10).max(500),
  documentType: z.literal("TD01"),
  transmissionFormat: z.literal("FPR12"),
  arubaTransmitterTaxCode: z.string().trim().regex(/^\d{11}$/),
  currency: z.literal("EUR"),
  lineDescription: z.string().trim().min(2).max(200),
  paymentMethod: z.literal("MP08"),
  provisionalNumberPrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,20}$/),
  stampDutyThresholdCents: z.number().int().min(0).max(1000000),
  stampDutyAmountCents: z.literal(200),
  stampDutyAbsorbed: z.literal(true),
  autoGenerateInvoices: z.boolean(),
  id: z.number().int().optional(),
  updatedAt: z.string().nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const result = await fetchBillingIssuerSettings(supabase);

    return NextResponse.json(result);
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile } = await requireSuperAdmin(request);
    const parsed = settingsSchema.safeParse(
      await request.json().catch(() => null),
    );

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Controlla i dati fiscali e le impostazioni Aruba." },
        { status: 422 },
      );
    }

    await saveBillingIssuerSettings({
      supabase,
      profileId: profile.id,
      settings: {
        ...parsed.data,
        id: 1,
        updatedAt: parsed.data.updatedAt ?? null,
      },
    });

    const result = await fetchBillingIssuerSettings(supabase);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
