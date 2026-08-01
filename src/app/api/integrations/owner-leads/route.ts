import { NextResponse, type NextRequest } from "next/server";
import {
  fetchOwnerLeadApiSettings,
  verifyOwnerLeadApiToken,
} from "@/lib/config/owner-lead-api-settings";
import { sendAdminOwnerRequestNotification } from "@/lib/email/notifications";
import {
  ownerLeadApiSchema,
  type OwnerLeadApiInput,
} from "@/lib/owner-requests/api-ingestion";
import {
  checkOwnerRequestDuplicates,
  duplicateCheckToJson,
} from "@/lib/owner-requests/duplicate-check";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 256_000;

type LeadSourceRow = {
  id: string;
  owner_request_id: string | null;
  error_message: string | null;
  received_at: string;
};

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");

  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "Payload troppo grande." },
      { status: 413 },
    );
  }

  const supabase = createServiceSupabaseClient();
  const { settings, storageReady } =
    await fetchOwnerLeadApiSettings(supabase);

  if (!storageReady) {
    return NextResponse.json(
      { error: "Configurazione webhook non disponibile." },
      { status: 503 },
    );
  }

  if (!settings.enabled) {
    return NextResponse.json(
      { error: "Webhook lead proprietari disattivato." },
      { status: 503 },
    );
  }

  const providedToken = readBearerToken(request);

  if (!verifyOwnerLeadApiToken(providedToken, settings.tokenHash)) {
    return NextResponse.json(
      { error: "Chiave webhook non valida." },
      { status: 401 },
    );
  }

  const rawPayload = await request.json().catch(() => null);
  const parsed = ownerLeadApiSchema.safeParse(rawPayload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Dati lead non validi.",
        fields: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 422 },
    );
  }

  const data = parsed.data;
  const idempotencyKey = `${data.provider}:${data.externalId}`;
  const sourceResult = await reserveLeadSource({
    idempotencyKey,
    externalId: data.externalId,
    rawPayload,
  });

  if (sourceResult.status === "duplicate") {
    return NextResponse.json({
      status: "duplicate",
      ownerRequestId: sourceResult.source.owner_request_id,
      externalId: data.externalId,
    });
  }

  if (sourceResult.status === "processing") {
    return NextResponse.json(
      {
        status: "processing",
        externalId: data.externalId,
      },
      { status: 202 },
    );
  }

  if (sourceResult.status === "failed") {
    return NextResponse.json(
      { error: sourceResult.error },
      { status: 500 },
    );
  }

  try {
    const result = await createOwnerRequest({
      data,
      source: sourceResult.source,
      rawPayload,
    });

    try {
      await sendAdminOwnerRequestNotification({
        ownerRequestId: result.ownerRequestId,
        reference: result.reference,
        city: data.city ?? "Non indicata",
        propertyType: data.propertyType ?? "Immobile",
      });
    } catch (notificationError) {
      console.error(
        "Owner lead API admin notification failed:",
        notificationError,
      );
    }

    return NextResponse.json(
      {
        status: "created",
        ownerRequestId: result.ownerRequestId,
        reference: result.reference,
        externalId: data.externalId,
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Errore durante l'importazione del lead.";

    await supabase
      .from("lead_sources")
      .update({ error_message: message })
      .eq("id", sourceResult.source.id);

    console.error("Owner lead API ingestion failed:", error);

    return NextResponse.json(
      { error: "Non sono riuscito a importare il lead." },
      { status: 500 },
    );
  }
}

async function reserveLeadSource({
  idempotencyKey,
  externalId,
  rawPayload,
}: {
  idempotencyKey: string;
  externalId: string;
  rawPayload: unknown;
}): Promise<
  | { status: "created" | "retry"; source: LeadSourceRow }
  | { status: "duplicate" | "processing"; source: LeadSourceRow }
  | { status: "failed"; error: string }
> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("lead_sources")
    .insert({
      channel: "api",
      external_id: externalId,
      idempotency_key: idempotencyKey,
      raw_payload: toJson(rawPayload),
    })
    .select("id,owner_request_id,error_message,received_at")
    .single();

  if (!error && data) {
    return { status: "created", source: data };
  }

  if (error?.code !== "23505") {
    return {
      status: "failed",
      error: error?.message ?? "Sorgente API non salvata.",
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from("lead_sources")
    .select("id,owner_request_id,error_message,received_at")
    .eq("channel", "api")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingError || !existing) {
    return {
      status: "failed",
      error: existingError?.message ?? "Sorgente API duplicata non recuperata.",
    };
  }

  if (existing.owner_request_id) {
    return { status: "duplicate", source: existing };
  }

  const retryThreshold = Date.now() - 5 * 60 * 1000;

  if (
    !existing.error_message &&
    new Date(existing.received_at).getTime() > retryThreshold
  ) {
    return { status: "processing", source: existing };
  }

  const { data: retried, error: retryError } = await supabase
    .from("lead_sources")
    .update({
      raw_payload: toJson(rawPayload),
      error_message: null,
      received_at: new Date().toISOString(),
    })
    .eq("id", existing.id)
    .select("id,owner_request_id,error_message,received_at")
    .single();

  if (retryError || !retried) {
    return {
      status: "failed",
      error: retryError?.message ?? "Sorgente API non riattivata.",
    };
  }

  return { status: "retry", source: retried };
}

async function createOwnerRequest({
  data,
  source,
  rawPayload,
}: {
  data: OwnerLeadApiInput;
  source: LeadSourceRow;
  rawPayload: unknown;
}) {
  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();
  const acquiredAt = data.submittedAt ?? now;
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
    source: {
      provider: data.provider,
      external_id: data.externalId,
    },
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
      first_name: data.firstName ?? null,
      last_name: data.lastName ?? null,
      email: data.email?.toLowerCase() ?? null,
      phone: data.phone ?? null,
      precise_address: data.address ?? null,
    },
  };
  const ownerRequestInsert = await insertNewOwnerRequest({
    acquisition_channel: "api",
    privacy_consent_at: acquiredAt,
    data_sharing_consent_at: acquiredAt,
    marketing_consent_at: data.marketingConsent ? acquiredAt : null,
    normalized_payload: toJson(normalizedPayload),
    duplicate_check: duplicateCheckToJson(duplicateCheck),
  });

  if (ownerRequestInsert.error || !ownerRequestInsert.data) {
    throw new Error(
      ownerRequestInsert.error?.message ?? "Richiesta proprietario non creata.",
    );
  }

  const ownerRequestId = ownerRequestInsert.data.id;
  const [contactResult, propertyResult, attributionResult, sourceUpdate] =
    await Promise.all([
      supabase.from("owner_contacts").insert({
        owner_request_id: ownerRequestId,
        first_name: data.firstName ?? null,
        last_name: data.lastName ?? null,
        email: data.email?.toLowerCase() ?? null,
        phone: data.phone ?? null,
        precise_address: data.address ?? null,
      }),
      supabase.from("properties").insert({
        owner_request_id: ownerRequestId,
        region: data.region ?? null,
        province: data.province ?? null,
        city: data.city ?? null,
        property_type: data.propertyType ?? null,
        bedrooms: data.bedrooms ?? null,
        bathrooms: data.bathrooms ?? null,
        approximate_area_sqm: data.areaSqm ?? null,
        current_status: data.currentStatus.length ? data.currentStatus : null,
        requested_services: data.requestedServices,
        timing: data.timing ?? null,
        description: data.description || null,
      }),
      supabase.from("marketing_attribution").insert({
        owner_request_id: ownerRequestId,
        source: data.attribution?.utmSource ?? data.provider,
        medium: data.attribution?.utmMedium ?? "api",
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
        meta_campaign_id: data.meta?.campaignId ?? null,
        meta_campaign_name: data.meta?.campaignName ?? null,
        meta_adset_id: data.meta?.adsetId ?? null,
        meta_adset_name: data.meta?.adsetName ?? null,
        meta_ad_id: data.meta?.adId ?? null,
        meta_ad_name: data.meta?.adName ?? null,
        meta_form_id: data.meta?.formId ?? null,
        meta_form_name: data.meta?.formName ?? null,
        meta_lead_id: data.meta?.leadId ?? data.externalId,
        acquired_at: acquiredAt,
      }),
      supabase
        .from("lead_sources")
        .update({
          owner_request_id: ownerRequestId,
          raw_payload: toJson(rawPayload),
          processed_at: now,
          error_message: null,
        })
        .eq("id", source.id),
    ]);

  const insertError =
    contactResult.error ||
    propertyResult.error ||
    attributionResult.error ||
    sourceUpdate.error;

  if (insertError) {
    await supabase.from("owner_requests").delete().eq("id", ownerRequestId);
    throw new Error(insertError.message);
  }

  return {
    ownerRequestId,
    reference: `LH-${ownerRequestId.slice(0, 8).toUpperCase()}`,
  };
}

async function insertNewOwnerRequest(
  row: {
    acquisition_channel: "api";
    privacy_consent_at: string;
    data_sharing_consent_at: string;
    marketing_consent_at: string | null;
    normalized_payload: Json;
    duplicate_check: Json;
  },
) {
  const supabase = createServiceSupabaseClient();
  const newLeadInsert = await supabase
    .from("owner_requests")
    .insert({
      ...row,
      status: "to_verify",
    })
    .select("id,created_at")
    .single();

  return newLeadInsert;
}

function readBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";

  return authorization.replace(/^Bearer\s+/i, "");
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}
