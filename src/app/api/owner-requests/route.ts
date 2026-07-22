import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { ITALY_GEO } from "@/lib/geo/italy-geo";
import {
  checkOwnerRequestDuplicates,
  duplicateCheckToJson,
} from "@/lib/owner-requests/duplicate-check";
import type { Json } from "@/lib/supabase/database.types";
import {
  sendAdminOwnerRequestNotification,
} from "@/lib/email/notifications";

const ownerRequestSchema = z.object({
  region: z.string().min(1),
  province: z.string().min(1),
  city: z.string().min(1),
  address: z.string().trim().min(3).max(180),
  propertyType: z.enum([
    "Appartamento",
    "Villa",
    "Casa indipendente",
    "B&B",
    "Struttura ricettiva",
    "Altro",
  ]),
  bedrooms: z.coerce.number().int().min(0).max(50),
  bathrooms: z.coerce.number().int().min(0).max(50),
  areaSqm: z.coerce.number().int().min(10).max(5000),
  currentStatus: z.array(z.string()).min(1).max(5),
  requestedServices: z.array(z.string()).min(1).max(8),
  timing: z.enum([
    "Il prima possibile",
    "Entro 30 giorni",
    "Entro 3 mesi",
    "Piu avanti",
    "Sto solo valutando",
  ]),
  description: z.string().trim().max(700).optional().default(""),
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().min(6).max(30),
  privacyConsent: z.literal(true),
  dataSharingConsent: z.literal(true),
  attribution: z
    .object({
      landingPage: z.string().max(500).optional(),
      referrer: z.string().max(500).optional(),
      utmSource: z.string().max(160).optional(),
      utmMedium: z.string().max(160).optional(),
      utmCampaign: z.string().max(160).optional(),
      utmContent: z.string().max(160).optional(),
      utmTerm: z.string().max(160).optional(),
    })
    .optional(),
});

const allowedCurrentStatuses = new Set([
  "Gia su Airbnb/Booking",
  "Gia usato per affitti brevi",
  "Mai usato per affitti brevi",
  "Gestito personalmente",
  "Affidato a un altro gestore",
]);

const allowedServices = new Set([
  "Gestione completa",
  "Gestione online",
  "Gestione annunci",
  "Revenue management",
  "Comunicazione ospiti",
  "Check-in / Check-out",
  "Pulizie",
  "Non lo so, vorrei essere consigliato",
]);

export async function POST(request: Request) {
  const payload = ownerRequestSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { error: "Dati richiesta non validi." },
      { status: 400 },
    );
  }

  const data = payload.data;

  if (!isValidGeoSelection(data.region, data.province, data.city)) {
    return NextResponse.json(
      { error: "Selezione geografica non valida." },
      { status: 400 },
    );
  }

  if (
    data.currentStatus.some((item) => !allowedCurrentStatuses.has(item)) ||
    data.requestedServices.some((item) => !allowedServices.has(item))
  ) {
    return NextResponse.json(
      { error: "Opzioni selezionate non valide." },
      { status: 400 },
    );
  }

  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();
  const duplicateCheck = await checkOwnerRequestDuplicates({
    supabase,
    input: {
      contact: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        preciseAddress: data.address,
      },
      property: {
        region: data.region,
        province: data.province,
        city: data.city,
        propertyType: data.propertyType,
      },
    },
  });
  const normalizedPayload = {
    property: {
      region: data.region,
      province: data.province,
      city: data.city,
      property_type: data.propertyType,
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms,
      approximate_area_sqm: data.areaSqm,
      current_status: data.currentStatus,
      requested_services: data.requestedServices,
      timing: data.timing,
      description: data.description || null,
    },
    contact: {
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email,
      phone: data.phone,
      precise_address: data.address,
    },
  };

  const { data: ownerRequest, error: ownerRequestError } =
    await insertPendingOwnerRequest(supabase, {
      acquisition_channel: "landing",
      privacy_consent_at: now,
      data_sharing_consent_at: now,
    normalized_payload: normalizedPayload as Json,
      duplicate_check: duplicateCheckToJson(duplicateCheck),
    });

  if (ownerRequestError || !ownerRequest) {
    return NextResponse.json(
      { error: "Non sono riuscito a salvare la richiesta." },
      { status: 500 },
    );
  }

  const requestId = ownerRequest.id;

  const [contactResult, propertyResult, sourceResult, attributionResult] =
    await Promise.all([
      supabase.from("owner_contacts").insert({
        owner_request_id: requestId,
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email,
        phone: data.phone,
        precise_address: data.address,
      }),
      supabase.from("properties").insert({
        owner_request_id: requestId,
        region: data.region,
        province: data.province,
        city: data.city,
        property_type: data.propertyType,
        bedrooms: data.bedrooms,
        bathrooms: data.bathrooms,
        approximate_area_sqm: data.areaSqm,
        current_status: data.currentStatus,
        requested_services: data.requestedServices,
        timing: data.timing,
        description: data.description || null,
      }),
      supabase.from("lead_sources").insert({
        owner_request_id: requestId,
        channel: "landing",
        idempotency_key: crypto.randomUUID(),
        raw_payload: data,
        processed_at: now,
      }),
      supabase.from("marketing_attribution").insert({
        owner_request_id: requestId,
        source: data.attribution?.utmSource ?? null,
        medium: data.attribution?.utmMedium ?? null,
        campaign: data.attribution?.utmCampaign ?? null,
        content: data.attribution?.utmContent ?? null,
        term: data.attribution?.utmTerm ?? null,
        landing_page: data.attribution?.landingPage ?? null,
        referrer: data.attribution?.referrer ?? null,
        utm_source: data.attribution?.utmSource ?? null,
        utm_medium: data.attribution?.utmMedium ?? null,
        utm_campaign: data.attribution?.utmCampaign ?? null,
        utm_content: data.attribution?.utmContent ?? null,
        utm_term: data.attribution?.utmTerm ?? null,
      }),
    ]);

  const insertError =
    contactResult.error ||
    propertyResult.error ||
    sourceResult.error ||
    attributionResult.error;

  if (insertError) {
    await supabase.from("owner_requests").delete().eq("id", requestId);

    return NextResponse.json(
      { error: "Richiesta creata, ma dati collegati incompleti." },
      { status: 500 },
    );
  }

  const reference = `LH-${requestId.slice(0, 8).toUpperCase()}`;

  await sendAdminOwnerRequestNotification({
    ownerRequestId: requestId,
    reference,
    city: data.city,
    propertyType: data.propertyType,
  });

  return NextResponse.json({
    status: "created",
    ownerRequestId: requestId,
    reference,
  });
}

function isValidGeoSelection(region: string, province: string, city: string) {
  const selectedRegion = ITALY_GEO.find((item) => item.region === region);
  const selectedProvince = selectedRegion?.provinces.find(
    (item) => item.province === province,
  );

  return Boolean((selectedProvince?.cities as string[] | undefined)?.includes(city));
}

async function insertPendingOwnerRequest(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  row: {
    acquisition_channel: "landing";
    privacy_consent_at: string;
    data_sharing_consent_at: string;
    normalized_payload: Json;
    duplicate_check: Json;
  },
) {
  const pendingInsert = await supabase
    .from("owner_requests")
    .insert({
      ...row,
      status: "pending",
    })
    .select("id,created_at")
    .single();

  if (
    !pendingInsert.error ||
    !pendingInsert.error.message.includes("owner_request_status")
  ) {
    return pendingInsert;
  }

  return supabase
    .from("owner_requests")
    .insert({
      ...row,
      status: "to_verify",
    })
    .select("id,created_at")
    .single();
}
