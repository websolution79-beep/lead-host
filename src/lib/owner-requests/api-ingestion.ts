import { z } from "zod";
import { ITALY_GEO } from "@/lib/geo/italy-geo";

const optionalStringListSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === "") return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value !== "string") return value;

    return value
      .split(/[|,;]/)
      .map((item) => item.trim())
      .filter(Boolean);
  },
  z.array(z.string().trim().min(1).max(160)).max(20).optional(),
).transform((value) => value ?? []);

const optionalBooleanSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }

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
  z.boolean().optional(),
);

function optionalStringSchema(max: number, min = 1) {
  return z.preprocess(
    (value) =>
      value === undefined || value === null || value === ""
        ? undefined
        : value,
    z.string().trim().min(min).max(max).optional(),
  );
}

function optionalIntegerSchema(min: number, max: number) {
  return z.preprocess(
    (value) =>
      value === undefined || value === null || value === ""
        ? undefined
        : value,
    z.coerce.number().int().min(min).max(max).optional(),
  );
}

export const ownerLeadApiSchema = z
  .object({
    externalId: z.preprocess(
      (value) => (typeof value === "number" ? String(value) : value),
      z.string().trim().min(1).max(200),
    ),
    provider: z.enum(["make", "zapier", "custom"]).default("custom"),
    submittedAt: z.string().datetime({ offset: true }).optional(),
    region: optionalStringSchema(100),
    province: optionalStringSchema(100),
    city: optionalStringSchema(160),
    address: optionalStringSchema(180),
    propertyType: optionalStringSchema(100),
    bedrooms: optionalIntegerSchema(0, 50),
    bathrooms: optionalIntegerSchema(0, 50),
    areaSqm: optionalIntegerSchema(1, 5000),
    currentStatus: optionalStringListSchema,
    requestedServices: optionalStringListSchema,
    timing: optionalStringSchema(120),
    description: optionalStringSchema(700),
    firstName: optionalStringSchema(80),
    lastName: optionalStringSchema(80),
    email: z.preprocess(
      (value) =>
        value === undefined || value === null || value === ""
          ? undefined
          : value,
      z.string().trim().email().max(160).optional(),
    ),
    phone: optionalStringSchema(30),
    privacyConsent: optionalBooleanSchema,
    dataSharingConsent: optionalBooleanSchema,
    marketingConsent: optionalBooleanSchema,
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
    if (
      data.region &&
      data.province &&
      data.city &&
      !isValidGeoSelection(data.region, data.province, data.city)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["city"],
        message: "Regione, provincia o città non valide.",
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
