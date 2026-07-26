import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { BillingIssuerSettings } from "@/lib/billing/invoice-types";

type ServiceClient = SupabaseClient<Database>;

type IssuerSettingsRow = {
  id: number;
  legal_name: string;
  vat_country_code: string;
  vat_number: string;
  fiscal_code: string;
  address_line: string;
  postal_code: string;
  city: string;
  province: string;
  country: string;
  email: string;
  tax_regime: string;
  tax_regime_description: string;
  vat_rate: number | string;
  vat_nature: string;
  vat_reference: string;
  document_type: string;
  transmission_format: string;
  aruba_transmitter_tax_code: string;
  currency: string;
  line_description: string;
  payment_method: string;
  provisional_number_prefix: string;
  stamp_duty_threshold_cents: number;
  stamp_duty_amount_cents: number;
  stamp_duty_absorbed: boolean;
  auto_generate_invoices: boolean;
  updated_at: string | null;
};

export const defaultBillingIssuerSettings: BillingIssuerSettings = {
  id: 1,
  legalName: "SOGI DI DOMINICI ROMINA",
  vatCountryCode: "IT",
  vatNumber: "17750971008",
  fiscalCode: "DMNRMN83D56H501A",
  addressLine: "Via Cogliate 135",
  postalCode: "00166",
  city: "Roma",
  province: "RM",
  country: "IT",
  email: "info@leadhost.it",
  taxRegime: "RF19",
  taxRegimeDescription:
    "Operazione senza applicazione dell'IVA ai sensi dell'art. 1, commi 54-89, L. 190/2014",
  vatRate: 0,
  vatNature: "N2.2",
  vatReference:
    "Operazione non soggetta a IVA - Regime forfettario L. 190/2014, art. 1, commi 54-89",
  documentType: "TD01",
  transmissionFormat: "FPR12",
  arubaTransmitterTaxCode: "01879020517",
  currency: "EUR",
  lineDescription: "Ricarica wallet Lead Host",
  paymentMethod: "MP08",
  provisionalNumberPrefix: "LH-TMP",
  stampDutyThresholdCents: 7747,
  stampDutyAmountCents: 200,
  stampDutyAbsorbed: true,
  autoGenerateInvoices: true,
  updatedAt: null,
};

export async function fetchBillingIssuerSettings(supabase: ServiceClient) {
  const table = supabase.from("billing_issuer_settings" as never) as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: number) => {
        maybeSingle: () => Promise<{
          data: IssuerSettingsRow | null;
          error: { code?: string; message?: string } | null;
        }>;
      };
    };
  };
  const { data, error } = await table.select("*").eq("id", 1).maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) {
      return {
        settings: defaultBillingIssuerSettings,
        storageReady: false,
      };
    }

    throw error;
  }

  return {
    settings: data ? mapIssuerSettings(data) : defaultBillingIssuerSettings,
    storageReady: Boolean(data),
  };
}

export async function saveBillingIssuerSettings({
  supabase,
  profileId,
  settings,
}: {
  supabase: ServiceClient;
  profileId: string;
  settings: BillingIssuerSettings;
}) {
  const table = supabase.from("billing_issuer_settings" as never) as unknown as {
    upsert: (
      row: Record<string, unknown>,
      options: { onConflict: string },
    ) => Promise<{ error: { code?: string; message?: string } | null }>;
  };
  const { error } = await table.upsert(
    {
      id: 1,
      legal_name: settings.legalName,
      vat_country_code: settings.vatCountryCode,
      vat_number: settings.vatNumber,
      fiscal_code: settings.fiscalCode,
      address_line: settings.addressLine,
      postal_code: settings.postalCode,
      city: settings.city,
      province: settings.province,
      country: settings.country,
      email: settings.email,
      tax_regime: settings.taxRegime,
      tax_regime_description: settings.taxRegimeDescription,
      vat_rate: settings.vatRate,
      vat_nature: settings.vatNature,
      vat_reference: settings.vatReference,
      document_type: settings.documentType,
      transmission_format: settings.transmissionFormat,
      aruba_transmitter_tax_code: settings.arubaTransmitterTaxCode,
      currency: settings.currency,
      line_description: settings.lineDescription,
      payment_method: settings.paymentMethod,
      provisional_number_prefix: settings.provisionalNumberPrefix,
      stamp_duty_threshold_cents: settings.stampDutyThresholdCents,
      stamp_duty_amount_cents: settings.stampDutyAmountCents,
      stamp_duty_absorbed: true,
      auto_generate_invoices: settings.autoGenerateInvoices,
      updated_by: profileId,
    },
    { onConflict: "id" },
  );

  if (error) throw error;
}

function mapIssuerSettings(row: IssuerSettingsRow): BillingIssuerSettings {
  return {
    id: row.id,
    legalName: row.legal_name,
    vatCountryCode: row.vat_country_code,
    vatNumber: row.vat_number,
    fiscalCode: row.fiscal_code,
    addressLine: row.address_line,
    postalCode: row.postal_code,
    city: row.city,
    province: row.province,
    country: row.country,
    email: row.email,
    taxRegime: row.tax_regime,
    taxRegimeDescription: row.tax_regime_description,
    vatRate: Number(row.vat_rate),
    vatNature: row.vat_nature,
    vatReference: row.vat_reference,
    documentType: row.document_type,
    transmissionFormat: row.transmission_format,
    arubaTransmitterTaxCode: row.aruba_transmitter_tax_code,
    currency: row.currency,
    lineDescription: row.line_description,
    paymentMethod: row.payment_method,
    provisionalNumberPrefix: row.provisional_number_prefix,
    stampDutyThresholdCents: row.stamp_duty_threshold_cents,
    stampDutyAmountCents: row.stamp_duty_amount_cents,
    stampDutyAbsorbed: row.stamp_duty_absorbed,
    autoGenerateInvoices: row.auto_generate_invoices,
    updatedAt: row.updated_at,
  };
}

function isMissingRelationError(error: { code?: string; message?: string }) {
  return (
    error.code === "PGRST205" ||
    error.message?.toLowerCase().includes("could not find the table")
  );
}
