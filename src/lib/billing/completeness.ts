export type BillingSubjectType = "individual" | "company";

export type BillingProfileInput = {
  subject_type: BillingSubjectType;
  first_name?: string | null;
  last_name?: string | null;
  fiscal_code?: string | null;
  company_name?: string | null;
  vat_number?: string | null;
  address_line?: string | null;
  postal_code?: string | null;
  city?: string | null;
  province?: string | null;
  country?: string | null;
  sdi_code?: string | null;
  pec?: string | null;
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

  return {
    complete: missingFields.length === 0,
    missingFields,
    missingLabels: missingFields.map((field) => fieldLabels[field] ?? field),
  };
}

function isNonEmpty(value: string | null | undefined) {
  return Boolean(value?.trim());
}

