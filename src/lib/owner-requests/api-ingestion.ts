import { z } from "zod";
import { ITALY_GEO } from "@/lib/geo/italy-geo";

const propertyTypes = [
  "Appartamento",
  "Villa",
  "Casa indipendente",
  "B&B",
  "Struttura ricettiva",
  "Altro",
] as const;

const timingOptions = [
  "Il prima possibile",
  "Entro 30 giorni",
  "Entro 3 mesi",
  "Piu avanti",
  "Sto solo valutando",
] as const;

const currentStatusOptions = new Set([
  "Gia su Airbnb/Booking",
  "Gia usato per affitti brevi",
  "Mai usato per affitti brevi",
  "Gestito personalmente",
  "Affidato a un altro gestore",
]);

const requestedServiceOptions = new Set([
  "Gestione completa",
  "Gestione online",
  "Gestione annunci",
  "Revenue management",
  "Comunicazione ospiti",
  "Check-in / Check-out",
  "Pulizie",
  "Non lo so, vorrei essere consigliato",
]);

const stringListSchema = z.preprocess(
  (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== "string") return value;

    return value
      .split(/[|,;]/)
      .map((item) => item.trim())
      .filter(Boolean);
  },
  z.array(z.string().trim().min(1)),
);

const requiredConsentSchema = z.preprocess(
  (value) =>
    value === true || value === "true" || value === "1" || value === 1
      ? true
      : value,
  z.literal(true),
);

const optionalBooleanSchema = z.preprocess(
  (value) => {
    if (value === true || value === "true" || value === "1" || value === 1) {
      return true;
    }

    if (
      value === false ||
      value === "false" ||
      value === "0" ||
      value === 0
    ) {
      return false;
    }

    return value;
  },
  z.boolean(),
);

export const ownerLeadApiSchema = z
  .object({
    externalId: z.string().trim().min(1).max(200),
    provider: z.enum(["make", "zapier", "custom"]).default("custom"),
    submittedAt: z.string().datetime({ offset: true }).optional(),
    region: z.string().trim().min(1).max(100),
    province: z.string().trim().min(1).max(100),
    city: z.string().trim().min(1).max(160),
    address: z.string().trim().min(3).max(180),
    propertyType: z.enum(propertyTypes),
    bedrooms: z.coerce.number().int().min(0).max(50),
    bathrooms: z.coerce.number().int().min(0).max(50),
    areaSqm: z.coerce.number().int().min(10).max(5000),
    currentStatus: stringListSchema,
    requestedServices: stringListSchema,
    timing: z.enum(timingOptions),
    description: z.string().trim().max(700).optional().default(""),
    firstName: z.string().trim().min(2).max(80),
    lastName: z.string().trim().min(2).max(80),
    email: z.string().trim().email().max(160),
    phone: z.string().trim().min(6).max(30),
    privacyConsent: requiredConsentSchema,
    dataSharingConsent: requiredConsentSchema,
    marketingConsent: optionalBooleanSchema.optional().default(false),
    attribution: z
      .object({
        landingPage: z.string().trim().max(500).optional(),
        referrer: z.string().trim().max(500).optional(),
        utmSource: z.string().trim().max(160).optional(),
        utmMedium: z.string().trim().max(160).optional(),
        utmCampaign: z.string().trim().max(160).optional(),
        utmContent: z.string().trim().max(160).optional(),
        utmTerm: z.string().trim().max(160).optional(),
      })
      .optional(),
    meta: z
      .object({
        campaignId: z.string().trim().max(160).optional(),
        campaignName: z.string().trim().max(250).optional(),
        adsetId: z.string().trim().max(160).optional(),
        adsetName: z.string().trim().max(250).optional(),
        adId: z.string().trim().max(160).optional(),
        adName: z.string().trim().max(250).optional(),
        formId: z.string().trim().max(160).optional(),
        formName: z.string().trim().max(250).optional(),
        leadId: z.string().trim().max(200).optional(),
      })
      .optional(),
  })
  .superRefine((data, context) => {
    if (!isValidGeoSelection(data.region, data.province, data.city)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["city"],
        message: "Regione, provincia o città non valide.",
      });
    }

    if (
      data.currentStatus.length < 1 ||
      data.currentStatus.length > 5 ||
      data.currentStatus.some((item) => !currentStatusOptions.has(item))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["currentStatus"],
        message: "Stato attuale non valido.",
      });
    }

    if (
      data.requestedServices.length < 1 ||
      data.requestedServices.length > 8 ||
      data.requestedServices.some(
        (item) => !requestedServiceOptions.has(item),
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["requestedServices"],
        message: "Servizi richiesti non validi.",
      });
    }
  });

export type OwnerLeadApiInput = z.infer<typeof ownerLeadApiSchema>;

export const ownerLeadApiExample = {
  externalId: "meta_lead_123456789",
  provider: "make",
  submittedAt: "2026-07-29T10:30:00+02:00",
  region: "Lazio",
  province: "Roma",
  city: "Roma",
  address: "Via Roma 10",
  propertyType: "Appartamento",
  bedrooms: 2,
  bathrooms: 1,
  areaSqm: 75,
  currentStatus: ["Mai usato per affitti brevi"],
  requestedServices: ["Gestione completa"],
  timing: "Entro 30 giorni",
  description: "Appartamento appena ristrutturato.",
  firstName: "Mario",
  lastName: "Rossi",
  email: "mario.rossi@example.com",
  phone: "+393331234567",
  privacyConsent: true,
  dataSharingConsent: true,
  marketingConsent: false,
  attribution: {
    utmSource: "facebook",
    utmMedium: "paid_social",
    utmCampaign: "proprietari_lazio",
  },
  meta: {
    campaignId: "120000000000001",
    campaignName: "Proprietari Lazio",
    adsetId: "120000000000002",
    adName: "Appartamento Roma",
    formId: "120000000000003",
    leadId: "123456789",
  },
};

function isValidGeoSelection(region: string, province: string, city: string) {
  const selectedRegion = ITALY_GEO.find((item) => item.region === region);
  const selectedProvince = selectedRegion?.provinces.find(
    (item) => item.province === province,
  );

  return Boolean(
    (selectedProvince?.cities as string[] | undefined)?.includes(city),
  );
}
