import {
  isValidEmail,
  isValidItalianFiscalCode,
  isValidItalianPostalCode,
  isValidItalianVatNumber,
  isValidProvinceCode,
  isValidSdiCode,
} from "@/lib/billing/fiscal-validation";

export type BillingSubjectType = "individual" | "company";

export type BillingProfileInput = {
  subject_type: BillingSubjectType;
  first_name?: string | null;
  last_name?: string | null;
  fiscal_code?: string | null;
  company_name?: string | null;
  vat_number?: string | null;
  company_fiscal_code?: string | null;
  address_line?: string | null;
  postal_code?: string | null;
  city?: string | null;
  province?: string | null;
  country?: string | null;
  sdi_code?: string | null;
  pec?: string | null;
  invoice_email?: string | null;
};

const fieldLabels: Record<string, string> = {
  first_name: "nome",
  last_name: "cognome",
  fiscal_code: "codice fiscale",
  company_name: "ragione sociale",
  vat_number: "partita IVA",
  address_line: "indirizzo",
  postal_code: "CAP",
  city: "città",
  province: "provincia",
  country: "paese",
  electronic_recipient: "Codice SDI o PEC",
  fiscal_code_invalid: "codice fiscale valido",
  vat_number_invalid: "partita IVA valida",
  company_fiscal_code_invalid: "codice fiscale societario valido",
  postal_code_invalid: "CAP italiano valido",
  province_invalid: "sigla provincia valida",
  country_invalid: "paese IT",
  sdi_code_invalid: "Codice SDI valido",
  pec_invalid: "PEC valida",
  invoice_email_invalid: "email fatture valida",
};

export function getBillingProfileCompleteness(
  profile: BillingProfileInput | null | undefined,
) {
  if (!profile) {
    return {
      complete: false,
      missingFields: ["billing_profile"],
      missingLabels: ["dati di fatturazione"],
    };
  }

  const commonFields = [
    "address_line",
    "postal_code",
    "city",
    "province",
    "country",
  ] as const;
  const requiredFields =
    profile.subject_type === "company"
      ? (["company_name", "vat_number", ...commonFields] as const)
      : (["first_name", "last_name", "fiscal_code", ...commonFields] as const);
  const missingFields = requiredFields.filter(
    (field) => !isNonEmpty(profile[field]),
  ) as string[];

  if (
    profile.subject_type === "company" &&
    !isNonEmpty(profile.sdi_code) &&
    !isNonEmpty(profile.pec)
  ) {
    missingFields.push("electronic_recipient");
  }

  const invalidFields: string[] = [];
  const country = profile.country?.trim().toUpperCase();

  if (country && country !== "IT") invalidFields.push("country_invalid");
  if (
    isNonEmpty(profile.postal_code) &&
    !isValidItalianPostalCode(profile.postal_code)
  ) {
    invalidFields.push("postal_code_invalid");
  }
  if (
    isNonEmpty(profile.province) &&
    !isValidProvinceCode(profile.province)
  ) {
    invalidFields.push("province_invalid");
  }

  if (profile.subject_type === "individual") {
    if (
      isNonEmpty(profile.fiscal_code) &&
      !isValidItalianFiscalCode(profile.fiscal_code)
    ) {
      invalidFields.push("fiscal_code_invalid");
    }
  } else {
    if (
      isNonEmpty(profile.vat_number) &&
      !isValidItalianVatNumber(profile.vat_number)
    ) {
      invalidFields.push("vat_number_invalid");
    }
    if (
      isNonEmpty(profile.company_fiscal_code) &&
      !isValidItalianFiscalCode(profile.company_fiscal_code)
    ) {
      invalidFields.push("company_fiscal_code_invalid");
    }
    if (isNonEmpty(profile.sdi_code) && !isValidSdiCode(profile.sdi_code)) {
      invalidFields.push("sdi_code_invalid");
    }
    if (isNonEmpty(profile.pec) && !isValidEmail(profile.pec)) {
      invalidFields.push("pec_invalid");
    }
  }

  if (
    isNonEmpty(profile.invoice_email) &&
    !isValidEmail(profile.invoice_email)
  ) {
    invalidFields.push("invoice_email_invalid");
  }

  const incompleteFields = [...missingFields, ...invalidFields];

  return {
    complete: incompleteFields.length === 0,
    missingFields: incompleteFields,
    missingLabels: incompleteFields.map(
      (field) => fieldLabels[field] ?? field,
    ),
  };
}

function isNonEmpty(value: string | null | undefined) {
  return Boolean(value?.trim());
}

