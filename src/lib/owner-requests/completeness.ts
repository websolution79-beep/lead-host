export type LeadCompletenessInput = {
  contact?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    preciseAddress?: string | null;
  } | null;
  property?: {
    region?: string | null;
    province?: string | null;
    city?: string | null;
    propertyType?: string | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    areaSqm?: number | null;
    currentStatus?: string[] | null;
    requestedServices?: string[] | null;
    timing?: string | null;
  } | null;
  consents?: {
    privacy?: boolean;
    dataSharing?: boolean;
  } | null;
};

export type MissingLeadField = {
  key: string;
  label: string;
  group: "proprietario" | "immobile" | "consensi";
};

export function getMissingLeadFields(
  input: LeadCompletenessInput,
): MissingLeadField[] {
  const contact = input.contact;
  const property = input.property;
  const consents = input.consents;
  const missing: MissingLeadField[] = [];

  addMissing(missing, "firstName", "Nome proprietario", "proprietario", contact?.firstName);
  addMissing(missing, "lastName", "Cognome proprietario", "proprietario", contact?.lastName);
  addMissing(missing, "email", "Email proprietario", "proprietario", contact?.email);
  addMissing(missing, "phone", "Telefono proprietario", "proprietario", contact?.phone);
  addMissing(missing, "address", "Indirizzo immobile", "immobile", contact?.preciseAddress);
  addMissing(missing, "region", "Regione", "immobile", property?.region);
  addMissing(missing, "province", "Provincia", "immobile", property?.province);
  addMissing(missing, "city", "Città", "immobile", property?.city);
  addMissing(
    missing,
    "propertyType",
    "Tipologia immobile",
    "immobile",
    property?.propertyType,
  );

  if (property?.bedrooms === null || property?.bedrooms === undefined) {
    missing.push({ key: "bedrooms", label: "Numero camere", group: "immobile" });
  }

  if (property?.bathrooms === null || property?.bathrooms === undefined) {
    missing.push({ key: "bathrooms", label: "Numero bagni", group: "immobile" });
  }

  if (property?.areaSqm === null || property?.areaSqm === undefined) {
    missing.push({ key: "areaSqm", label: "Metratura", group: "immobile" });
  }

  if (!property?.currentStatus?.length) {
    missing.push({
      key: "currentStatus",
      label: "Stato attuale immobile",
      group: "immobile",
    });
  }

  if (!property?.requestedServices?.length) {
    missing.push({
      key: "requestedServices",
      label: "Servizi richiesti",
      group: "immobile",
    });
  }

  addMissing(missing, "timing", "Tempistica", "immobile", property?.timing);

  if (!consents?.privacy) {
    missing.push({
      key: "privacyConsent",
      label: "Consenso privacy",
      group: "consensi",
    });
  }

  if (!consents?.dataSharing) {
    missing.push({
      key: "dataSharingConsent",
      label: "Consenso condivisione dati",
      group: "consensi",
    });
  }

  return missing;
}

function addMissing(
  missing: MissingLeadField[],
  key: string,
  label: string,
  group: MissingLeadField["group"],
  value: string | null | undefined,
) {
  if (!value?.trim()) {
    missing.push({ key, label, group });
  }
}
