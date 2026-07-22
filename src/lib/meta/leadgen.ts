import { createHmac, timingSafeEqual } from "crypto";
import { getEnv } from "@/lib/env";
import { ITALY_GEO } from "@/lib/geo/italy-geo";
import type { Json } from "@/lib/supabase/database.types";

export type MetaWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    changes?: Array<{
      field?: string;
      value?: MetaLeadgenChangeValue;
    }>;
  }>;
};

export type MetaLeadgenChangeValue = {
  ad_id?: string;
  ad_name?: string;
  adgroup_id?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  created_time?: number | string;
  form_id?: string;
  leadgen_id?: string;
  page_id?: string;
};

export type MetaLeadPayload = {
  id: string;
  created_time?: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  field_data?: Array<{
    name: string;
    values?: string[];
  }>;
};

export type NormalizedMetaLead = {
  property: {
    region: string | null;
    province: string | null;
    city: string | null;
    property_type: string;
    bedrooms: number | null;
    bathrooms: number | null;
    approximate_area_sqm: number | null;
    current_status: string[];
    requested_services: string[];
    timing: string;
    description: string | null;
  };
  contact: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    precise_address: string | null;
  };
  fields: Record<string, string>;
};

export type MetaFieldMapping = {
  source_field: string;
  normalized_field: string;
};

const defaultFieldAliases: Record<string, string[]> = {
  firstName: ["nome", "first_name", "firstname", "first name"],
  lastName: ["cognome", "last_name", "lastname", "last name"],
  fullName: ["nome_completo", "full_name", "name", "nome e cognome"],
  email: ["email", "e-mail", "indirizzo_email", "email_address"],
  phone: ["telefono", "phone", "phone_number", "numero_di_telefono", "cellulare"],
  region: ["regione", "region"],
  province: ["provincia", "province"],
  city: ["citta", "città", "comune", "city", "localita", "località"],
  address: ["indirizzo", "address", "street_address", "via"],
  propertyType: ["tipologia", "tipologia_immobile", "property_type", "tipo_immobile"],
  bedrooms: ["camere", "bedrooms", "numero_camere"],
  bathrooms: ["bagni", "bathrooms", "numero_bagni"],
  areaSqm: ["mq", "metri_quadri", "superficie", "area_sqm"],
  currentStatus: ["stato_attuale", "situazione_attuale", "current_status"],
  requestedServices: ["servizi", "servizi_richiesti", "requested_services"],
  timing: ["tempistiche", "quando", "timing"],
  description: ["descrizione", "note", "messaggio", "description"],
};

const propertyTypeOptions = [
  "Appartamento",
  "Villa",
  "Casa indipendente",
  "B&B",
  "Struttura ricettiva",
  "Altro",
];

const timingOptions = [
  "Il prima possibile",
  "Entro 30 giorni",
  "Entro 3 mesi",
  "Piu avanti",
  "Sto solo valutando",
];

const currentStatusOptions = [
  "Gia su Airbnb/Booking",
  "Gia usato per affitti brevi",
  "Mai usato per affitti brevi",
  "Gestito personalmente",
  "Affidato a un altro gestore",
];

const requestedServiceOptions = [
  "Gestione completa",
  "Gestione online",
  "Gestione annunci",
  "Revenue management",
  "Comunicazione ospiti",
  "Check-in / Check-out",
  "Pulizie",
  "Non lo so, vorrei essere consigliato",
];

export function verifyMetaSignature(rawBody: string, signatureHeader: string | null) {
  const appSecret = getEnv("META_APP_SECRET");

  if (!appSecret) return { ok: false, reason: "missing_app_secret" as const };
  if (!signatureHeader?.startsWith("sha256=")) {
    return { ok: false, reason: "missing_signature" as const };
  }

  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const received = signatureHeader.slice("sha256=".length);
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");

  if (expectedBuffer.length !== receivedBuffer.length) {
    return { ok: false, reason: "invalid_signature" as const };
  }

  return {
    ok: timingSafeEqual(expectedBuffer, receivedBuffer),
    reason: timingSafeEqual(expectedBuffer, receivedBuffer)
      ? null
      : ("invalid_signature" as const),
  };
}

export function extractLeadgenChanges(payload: MetaWebhookPayload) {
  return (payload.entry ?? []).flatMap((entry) =>
    (entry.changes ?? [])
      .filter((change) => change.field === "leadgen" && change.value?.leadgen_id)
      .map((change) => ({
        pageId: entry.id ?? change.value?.page_id ?? null,
        entryTime: entry.time ?? null,
        value: change.value as MetaLeadgenChangeValue,
      })),
  );
}

export async function fetchMetaLead(leadgenId: string) {
  const accessToken = getEnv("META_SYSTEM_USER_ACCESS_TOKEN");
  const appSecret = getEnv("META_APP_SECRET");
  const graphVersion = getEnv("META_GRAPH_API_VERSION") ?? "v23.0";

  if (!accessToken) {
    throw new Error("META_SYSTEM_USER_ACCESS_TOKEN non configurato.");
  }

  const url = new URL(`https://graph.facebook.com/${graphVersion}/${leadgenId}`);
  url.searchParams.set(
    "fields",
    [
      "id",
      "created_time",
      "ad_id",
      "ad_name",
      "adset_id",
      "adset_name",
      "campaign_id",
      "campaign_name",
      "form_id",
      "field_data",
    ].join(","),
  );
  url.searchParams.set("access_token", accessToken);

  if (appSecret) {
    url.searchParams.set(
      "appsecret_proof",
      createHmac("sha256", appSecret).update(accessToken).digest("hex"),
    );
  }

  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof body?.error?.message === "string"
        ? body.error.message
        : "Impossibile recuperare il lead da Meta.";

    throw new Error(message);
  }

  return body as MetaLeadPayload;
}

export function normalizeMetaLead(
  lead: MetaLeadPayload,
  mappings: MetaFieldMapping[] = [],
): NormalizedMetaLead {
  const fields = buildFieldMap(lead.field_data ?? []);
  const mappedFields = applyMappings(fields, mappings);
  const firstName = pickField(mappedFields, "firstName");
  const lastName = pickField(mappedFields, "lastName");
  const fullName = pickField(mappedFields, "fullName");
  const splitName = splitFullName(fullName);
  const location = normalizeLocation({
    region: pickField(mappedFields, "region"),
    province: pickField(mappedFields, "province"),
    city: pickField(mappedFields, "city"),
  });
  const requestedServices = normalizeMultiOption(
    pickField(mappedFields, "requestedServices"),
    requestedServiceOptions,
    ["Non lo so, vorrei essere consigliato"],
  );

  return {
    property: {
      region: location.region,
      province: location.province,
      city: location.city,
      property_type: normalizeOption(
        pickField(mappedFields, "propertyType"),
        propertyTypeOptions,
        "Appartamento",
      ),
      bedrooms: parseInteger(pickField(mappedFields, "bedrooms")),
      bathrooms: parseInteger(pickField(mappedFields, "bathrooms")),
      approximate_area_sqm: parseInteger(pickField(mappedFields, "areaSqm")),
      current_status: normalizeMultiOption(
        pickField(mappedFields, "currentStatus"),
        currentStatusOptions,
        ["Mai usato per affitti brevi"],
      ),
      requested_services: requestedServices,
      timing: normalizeOption(
        pickField(mappedFields, "timing"),
        timingOptions,
        "Sto solo valutando",
      ),
      description: pickField(mappedFields, "description") || null,
    },
    contact: {
      first_name: firstName || splitName.firstName,
      last_name: lastName || splitName.lastName,
      email: pickField(mappedFields, "email")?.toLowerCase() || null,
      phone: pickField(mappedFields, "phone") || null,
      precise_address: pickField(mappedFields, "address") || null,
    },
    fields,
  };
}

export function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function buildFieldMap(fieldData: NonNullable<MetaLeadPayload["field_data"]>) {
  return fieldData.reduce<Record<string, string>>((fields, item) => {
    const key = normalizeKey(item.name);
    const value = (item.values ?? []).filter(Boolean).join(", ").trim();

    if (key && value) fields[key] = value;

    return fields;
  }, {});
}

function applyMappings(fields: Record<string, string>, mappings: MetaFieldMapping[]) {
  const mapped = { ...fields };

  for (const mapping of mappings) {
    const sourceKey = normalizeKey(mapping.source_field);
    const normalizedKey = normalizeKey(mapping.normalized_field);

    if (fields[sourceKey] && normalizedKey) {
      mapped[normalizedKey] = fields[sourceKey];
    }
  }

  return mapped;
}

function pickField(fields: Record<string, string>, normalizedField: keyof typeof defaultFieldAliases) {
  for (const alias of defaultFieldAliases[normalizedField]) {
    const value = fields[normalizeKey(alias)];

    if (value) return value.trim();
  }

  return "";
}

function normalizeLocation({
  region,
  province,
  city,
}: {
  region: string;
  province: string;
  city: string;
}) {
  const regionKey = normalizeComparable(region);
  const provinceKey = normalizeComparable(province);
  const cityKey = normalizeComparable(city);

  for (const geoRegion of ITALY_GEO) {
    const regionMatches = !regionKey || normalizeComparable(geoRegion.region) === regionKey;

    for (const geoProvince of geoRegion.provinces) {
      const provinceMatches =
        !provinceKey || normalizeComparable(geoProvince.province) === provinceKey;
      const matchedCity = geoProvince.cities.find(
        (candidate) => normalizeComparable(candidate) === cityKey,
      );

      if ((cityKey ? matchedCity : true) && regionMatches && provinceMatches) {
        return {
          region: geoRegion.region,
          province: geoProvince.province,
          city: matchedCity ?? (city.trim() || null),
        };
      }
    }
  }

  return {
    region: region.trim() || null,
    province: province.trim() || null,
    city: city.trim() || null,
  };
}

function normalizeOption(value: string, options: string[], fallback: string) {
  const valueKey = normalizeComparable(value);
  const match = options.find((option) => normalizeComparable(option) === valueKey);

  return match ?? fallback;
}

function normalizeMultiOption(value: string, options: string[], fallback: string[]) {
  const values = value
    .split(/[,;\n|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const matches = values
    .map((item) => normalizeOption(item, options, ""))
    .filter(Boolean);

  return matches.length ? Array.from(new Set(matches)) : fallback;
}

function parseInteger(value: string) {
  const parsed = Number.parseInt(value.replace(/[^\d]/g, ""), 10);

  return Number.isFinite(parsed) ? parsed : null;
}

function splitFullName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);

  if (!parts.length) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };

  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) ?? null };
}

function normalizeKey(value: string) {
  return normalizeComparable(value)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeComparable(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
