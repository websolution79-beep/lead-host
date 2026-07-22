import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { sendAdminOwnerRequestNotification } from "@/lib/email/notifications";
import { ITALY_GEO } from "@/lib/geo/italy-geo";
import {
  hashOwnerRequestCompletionToken,
  isOwnerRequestCompletionExpired,
} from "@/lib/owner-requests/completion-token";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

const completionSchema = z.object({
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

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const completion = await fetchCompletionRequest(token);

    if (!completion.ok) {
      return NextResponse.json({ error: completion.error }, { status: completion.status });
    }

    return NextResponse.json(completion.data);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Non sono riuscito a verificare il link." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const completion = await fetchCompletionRequest(token);

    if (!completion.ok) {
      return NextResponse.json({ error: completion.error }, { status: completion.status });
    }

    const payload = completionSchema.safeParse(await request.json());

    if (!payload.success) {
      return NextResponse.json(
        { error: "Completa tutti i dati richiesti per inviare la richiesta." },
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
    const normalizedPayload = {
      ...completion.data.normalizedPayload,
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
      completion: {
        completed_at: now,
        completed_from: "token",
      },
    };

    const [contactResult, propertyResult] = await Promise.all([
      supabase.from("owner_contacts").upsert(
        {
          owner_request_id: completion.data.ownerRequestId,
          first_name: data.firstName,
          last_name: data.lastName,
          email: data.email,
          phone: data.phone,
          precise_address: data.address,
        },
        { onConflict: "owner_request_id" },
      ),
      supabase.from("properties").upsert(
        {
          owner_request_id: completion.data.ownerRequestId,
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
        { onConflict: "owner_request_id" },
      ),
    ]);

    const writeError = contactResult.error || propertyResult.error;

    if (writeError) {
      throw writeError;
    }

    const statusUpdate = await markRequestReadyForReview({
      ownerRequestId: completion.data.ownerRequestId,
      normalizedPayload: normalizedPayload as Json,
      completedAt: now,
    });

    if (statusUpdate.error) {
      throw statusUpdate.error;
    }

    const reference = `LH-${completion.data.ownerRequestId.slice(0, 8).toUpperCase()}`;

    await sendAdminOwnerRequestNotification({
      ownerRequestId: completion.data.ownerRequestId,
      reference,
      city: data.city,
      propertyType: data.propertyType,
    });

    return NextResponse.json({
      status: "completed",
      ownerRequestId: completion.data.ownerRequestId,
      reference,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Non sono riuscito a completare la richiesta." },
      { status: 500 },
    );
  }
}

async function fetchCompletionRequest(token: string): Promise<
  | {
      ok: true;
      data: {
        ownerRequestId: string;
        acquisitionChannel: string;
        expiresAt: string | null;
        normalizedPayload: Record<string, unknown>;
        initialValues: CompletionInitialValues;
      };
    }
  | { ok: false; status: number; error: string }
> {
  const supabase = createServiceSupabaseClient();
  const tokenHash = hashOwnerRequestCompletionToken(token);
  const { data: ownerRequest, error: requestError } = await supabase
    .from("owner_requests")
    .select(
      "id,status,acquisition_channel,completion_token_expires_at,completion_token_invalidated_at,normalized_payload",
    )
    .eq("completion_token_hash", tokenHash)
    .maybeSingle();

  if (requestError) {
    throw requestError;
  }

  if (!ownerRequest) {
    return { ok: false, status: 404, error: "Link non valido o già utilizzato." };
  }

  if (ownerRequest.completion_token_invalidated_at) {
    return { ok: false, status: 410, error: "Questo link è già stato utilizzato." };
  }

  if (isOwnerRequestCompletionExpired(ownerRequest.completion_token_expires_at)) {
    return { ok: false, status: 410, error: "Questo link è scaduto." };
  }

  if (!["waiting_for_completion", "new_from_meta"].includes(ownerRequest.status)) {
    return {
      ok: false,
      status: 409,
      error: "Questa richiesta non è più in fase di completamento.",
    };
  }

  const [contactResult, propertyResult] = await Promise.all([
    supabase
      .from("owner_contacts")
      .select("first_name,last_name,email,phone,precise_address")
      .eq("owner_request_id", ownerRequest.id)
      .maybeSingle(),
    supabase
      .from("properties")
      .select(
        "region,province,city,property_type,bedrooms,bathrooms,approximate_area_sqm,current_status,requested_services,timing,description",
      )
      .eq("owner_request_id", ownerRequest.id)
      .maybeSingle(),
  ]);

  if (contactResult.error) throw contactResult.error;
  if (propertyResult.error) throw propertyResult.error;

  return {
    ok: true,
    data: {
      ownerRequestId: ownerRequest.id,
      acquisitionChannel: ownerRequest.acquisition_channel,
      expiresAt: ownerRequest.completion_token_expires_at,
      normalizedPayload: toPlainRecord(ownerRequest.normalized_payload),
      initialValues: {
        region: propertyResult.data?.region ?? "",
        province: propertyResult.data?.province ?? "",
        city: propertyResult.data?.city ?? "",
        address: contactResult.data?.precise_address ?? "",
        propertyType: propertyResult.data?.property_type ?? "",
        bedrooms: stringifyNumber(propertyResult.data?.bedrooms),
        bathrooms: stringifyNumber(propertyResult.data?.bathrooms),
        areaSqm: stringifyNumber(propertyResult.data?.approximate_area_sqm),
        currentStatus: propertyResult.data?.current_status ?? [],
        requestedServices: propertyResult.data?.requested_services ?? [],
        timing: propertyResult.data?.timing ?? "",
        description: propertyResult.data?.description ?? "",
        firstName: contactResult.data?.first_name ?? "",
        lastName: contactResult.data?.last_name ?? "",
        email: contactResult.data?.email ?? "",
        phone: contactResult.data?.phone ?? "",
        privacyConsent: false,
        dataSharingConsent: false,
      },
    },
  };
}

async function markRequestReadyForReview({
  ownerRequestId,
  normalizedPayload,
  completedAt,
}: {
  ownerRequestId: string;
  normalizedPayload: Json;
  completedAt: string;
}) {
  const supabase = createServiceSupabaseClient();
  const pendingUpdate = await supabase
    .from("owner_requests")
    .update({
      status: "pending",
      completion_token_invalidated_at: completedAt,
      privacy_consent_at: completedAt,
      data_sharing_consent_at: completedAt,
      normalized_payload: normalizedPayload,
    })
    .eq("id", ownerRequestId);

  if (
    !pendingUpdate.error ||
    !pendingUpdate.error.message.includes("owner_request_status")
  ) {
    return pendingUpdate;
  }

  return supabase
    .from("owner_requests")
    .update({
      status: "to_verify",
      completion_token_invalidated_at: completedAt,
      privacy_consent_at: completedAt,
      data_sharing_consent_at: completedAt,
      normalized_payload: normalizedPayload,
    })
    .eq("id", ownerRequestId);
}

function isValidGeoSelection(region: string, province: string, city: string) {
  const selectedRegion = ITALY_GEO.find((item) => item.region === region);
  const selectedProvince = selectedRegion?.provinces.find(
    (item) => item.province === province,
  );

  return Boolean((selectedProvince?.cities as string[] | undefined)?.includes(city));
}

function stringifyNumber(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function toPlainRecord(value: Json) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return value as Record<string, unknown>;
}

type CompletionInitialValues = {
  region: string;
  province: string;
  city: string;
  address: string;
  propertyType: string;
  bedrooms: string;
  bathrooms: string;
  areaSqm: string;
  currentStatus: string[];
  requestedServices: string[];
  timing: string;
  description: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  privacyConsent: boolean;
  dataSharingConsent: boolean;
};
