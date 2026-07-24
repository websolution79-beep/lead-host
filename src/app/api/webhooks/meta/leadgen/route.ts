import { NextResponse } from "next/server";
import { appUrl, getEnv } from "@/lib/env";
import {
  sendAdminOwnerRequestNotification,
  sendOwnerRequestCompletionEmail,
} from "@/lib/email/notifications";
import {
  extractLeadgenChanges,
  fetchMetaLead,
  normalizeMetaLead,
  toJson,
  verifyMetaSignature,
  type MetaFieldMapping,
  type MetaLeadPayload,
  type MetaLeadgenChangeValue,
  type MetaWebhookPayload,
  type NormalizedMetaLead,
} from "@/lib/meta/leadgen";
import { createOwnerRequestCompletionToken } from "@/lib/owner-requests/completion-token";
import {
  checkOwnerRequestDuplicates,
  duplicateCheckToJson,
} from "@/lib/owner-requests/duplicate-check";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

type LeadSourceRow = {
  id: string;
  owner_request_id: string | null;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token &&
    token === getEnv("META_VERIFY_TOKEN") &&
    challenge
  ) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Invalid Meta verification" }, { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const verification = verifyMetaSignature(rawBody, signature);

  if (!verification.ok) {
    return NextResponse.json(
      { error: "Firma Meta non valida.", reason: verification.reason },
      { status: verification.reason === "missing_app_secret" ? 503 : 401 },
    );
  }

  let payload: MetaWebhookPayload;

  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Payload Meta non valido." }, { status: 400 });
  }

  const changes = extractLeadgenChanges(payload);

  if (!changes.length) {
    return NextResponse.json({ received: true, processed: 0, results: [] });
  }

  const results = [];

  for (const change of changes) {
    results.push(await processLeadgenChange({ payload, change }));
  }

  return NextResponse.json({
    received: true,
    processed: results.length,
    results,
  });
}

async function processLeadgenChange({
  payload,
  change,
}: {
  payload: MetaWebhookPayload;
  change: {
    pageId: string | null;
    entryTime: number | null;
    value: MetaLeadgenChangeValue;
  };
}) {
  const leadgenId = change.value.leadgen_id;

  if (!leadgenId) {
    return { status: "skipped", reason: "missing_leadgen_id" };
  }

  const supabase = createServiceSupabaseClient();
  const sourceResult = await createLeadSource({
    leadgenId,
    rawPayload: {
      webhook: payload,
      change,
    },
  });

  if (sourceResult.status === "duplicate") {
    return {
      status: "duplicate",
      leadgenId,
      ownerRequestId: sourceResult.source.owner_request_id,
    };
  }

  if (sourceResult.status === "failed") {
    return { status: "failed", leadgenId, error: sourceResult.error };
  }

  const source = sourceResult.source;

  try {
    const lead = await fetchMetaLead(leadgenId);
    const mappings = await fetchFormMappings(lead.form_id ?? change.value.form_id ?? null);
    const normalized = normalizeMetaLead(lead, mappings);
    const ownerRequest = await createOwnerRequestFromMetaLead({
      lead,
      change: change.value,
      normalized,
    });

    const rawPayload = toJson({
      webhook: payload,
      change,
      lead,
      normalized,
    });

    await Promise.all([
      supabase
        .from("lead_sources")
        .update({
          owner_request_id: ownerRequest.id,
          raw_payload: rawPayload,
          processed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", source.id),
      ownerRequest.status === "waiting_for_completion"
        ? Promise.resolve()
        : sendAdminOwnerRequestNotification({
            ownerRequestId: ownerRequest.id,
            reference: `LH-${ownerRequest.id.slice(0, 8).toUpperCase()}`,
            city: normalized.property.city ?? "Da verificare",
            propertyType:
              normalized.property.property_type ?? "Tipologia da verificare",
          }),
    ]);

    return {
      status: "created",
      leadgenId,
      ownerRequestId: ownerRequest.id,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Errore importazione lead Meta.";

    await supabase
      .from("lead_sources")
      .update({ error_message: message })
      .eq("id", source.id);

    return { status: "failed", leadgenId, error: message };
  }
}

async function createLeadSource({
  leadgenId,
  rawPayload,
}: {
  leadgenId: string;
  rawPayload: unknown;
}): Promise<
  | { status: "created"; source: LeadSourceRow }
  | { status: "duplicate"; source: LeadSourceRow }
  | { status: "failed"; error: string }
> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("lead_sources")
    .insert({
      channel: "meta_lead_ads",
      external_id: leadgenId,
      idempotency_key: leadgenId,
      raw_payload: toJson(rawPayload),
    })
    .select("id,owner_request_id")
    .single();

  if (!error && data) {
    return { status: "created", source: data };
  }

  if (error?.code !== "23505") {
    return {
      status: "failed",
      error: error?.message ?? "Lead source Meta non salvata.",
    };
  }

  const { data: duplicate, error: duplicateError } = await supabase
    .from("lead_sources")
    .select("id,owner_request_id")
    .eq("channel", "meta_lead_ads")
    .eq("idempotency_key", leadgenId)
    .maybeSingle();

  if (duplicateError || !duplicate) {
    return {
      status: "failed",
      error: duplicateError?.message ?? "Lead source duplicata non recuperata.",
    };
  }

  return { status: "duplicate", source: duplicate };
}

async function createOwnerRequestFromMetaLead({
  lead,
  change,
  normalized,
}: {
  lead: MetaLeadPayload;
  change: MetaLeadgenChangeValue;
  normalized: NormalizedMetaLead;
}) {
  const supabase = createServiceSupabaseClient();
  const acquiredAt = lead.created_time ?? new Date().toISOString();
  const completion = buildCompletionTokenIfRequired(normalized);
  const duplicateCheck = await checkOwnerRequestDuplicates({
    supabase,
    input: {
      contact: {
        firstName: normalized.contact.first_name,
        lastName: normalized.contact.last_name,
        email: normalized.contact.email,
        phone: normalized.contact.phone,
        preciseAddress: normalized.contact.precise_address,
      },
      property: {
        region: normalized.property.region,
        province: normalized.property.province,
        city: normalized.property.city,
        propertyType: normalized.property.property_type,
      },
    },
  });
  const normalizedPayload = toJson({
    meta_lead_id: lead.id,
    property: normalized.property,
    contact: normalized.contact,
    fields: normalized.fields,
    completion_required: Boolean(completion),
    missing_fields: completion?.missingFields ?? [],
  });
  const { data: ownerRequest, error: ownerRequestError } =
    await insertPendingOwnerRequest({
      acquisition_channel: "meta_lead_ads",
      status: completion ? "waiting_for_completion" : "pending",
      completion_token_hash: completion?.tokenHash ?? null,
      completion_token_expires_at: completion?.expiresAt ?? null,
      privacy_consent_at: acquiredAt,
      data_sharing_consent_at: acquiredAt,
      normalized_payload: normalizedPayload,
      duplicate_check: duplicateCheckToJson({
        ...duplicateCheck,
        source: "meta_lead_ads",
        external_id: lead.id,
      }),
    });

  if (ownerRequestError || !ownerRequest) {
    throw ownerRequestError ?? new Error("Richiesta proprietario Meta non creata.");
  }

  const requestId = ownerRequest.id;
  const marketingAttributionTable = supabase.from(
    "marketing_attribution" as never,
  ) as unknown as {
    insert: (row: Record<string, unknown>) => Promise<{
      error: { message?: string } | null;
    }>;
  };
  const [contactResult, propertyResult, attributionResult] = await Promise.all([
    supabase.from("owner_contacts").insert({
      owner_request_id: requestId,
      first_name: normalized.contact.first_name,
      last_name: normalized.contact.last_name,
      email: normalized.contact.email,
      phone: normalized.contact.phone,
      precise_address: normalized.contact.precise_address,
    }),
    supabase.from("properties").insert({
      owner_request_id: requestId,
      region: normalized.property.region,
      province: normalized.property.province,
      city: normalized.property.city,
      property_type: normalized.property.property_type,
      bedrooms: normalized.property.bedrooms,
      bathrooms: normalized.property.bathrooms,
      approximate_area_sqm: normalized.property.approximate_area_sqm,
      current_status: normalized.property.current_status,
      requested_services: normalized.property.requested_services,
      timing: normalized.property.timing,
      description: normalized.property.description,
    }),
    marketingAttributionTable.insert({
      owner_request_id: requestId,
      source: "meta",
      medium: "lead_ads",
      campaign: lead.campaign_name ?? null,
      content: lead.ad_name ?? null,
      meta_campaign_id: lead.campaign_id ?? change.campaign_id ?? null,
      meta_campaign_name: lead.campaign_name ?? change.campaign_name ?? null,
      meta_adset_id: lead.adset_id ?? change.adset_id ?? change.adgroup_id ?? null,
      meta_adset_name: lead.adset_name ?? change.adset_name ?? null,
      meta_ad_id: lead.ad_id ?? change.ad_id ?? null,
      meta_ad_name: lead.ad_name ?? change.ad_name ?? null,
      meta_form_id: lead.form_id ?? change.form_id ?? null,
      meta_lead_id: lead.id,
      acquired_at: acquiredAt,
    }),
  ]);

  const insertError =
    contactResult.error || propertyResult.error || attributionResult.error;

  if (insertError) {
    await supabase.from("owner_requests").delete().eq("id", requestId);
    throw insertError;
  }

  if (completion?.token && normalized.contact.email) {
    await sendOwnerRequestCompletionEmail({
      ownerRequestId: requestId,
      to: normalized.contact.email,
      propertyHint: buildPropertyHint(normalized),
      completionUrl: `${appUrl}/completa-richiesta/${completion.token}`,
      expiresAt: completion.expiresAt,
    });
  }

  return ownerRequest;
}

async function insertPendingOwnerRequest(row: {
  acquisition_channel: "meta_lead_ads";
  status: "pending" | "waiting_for_completion";
  completion_token_hash: string | null;
  completion_token_expires_at: string | null;
  privacy_consent_at: string;
  data_sharing_consent_at: string;
  normalized_payload: Json;
  duplicate_check: Json;
}) {
  const supabase = createServiceSupabaseClient();
  const pendingInsert = await supabase
    .from("owner_requests")
    .insert({
      ...row,
    })
    .select("id,created_at,status")
    .single();

  if (
    row.status !== "pending" ||
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
    .select("id,created_at,status")
    .single();
}

function buildCompletionTokenIfRequired(normalized: NormalizedMetaLead) {
  const missingFields = getMissingCompletionFields(normalized);

  if (!missingFields.length) return null;

  return {
    ...createOwnerRequestCompletionToken(),
    missingFields,
  };
}

function getMissingCompletionFields(normalized: NormalizedMetaLead) {
  const missing: string[] = [];

  if (!normalized.property.region) missing.push("region");
  if (!normalized.property.province) missing.push("province");
  if (!normalized.property.city) missing.push("city");
  if (!normalized.contact.precise_address) missing.push("address");
  if (!normalized.property.property_type) missing.push("property_type");
  if (!normalized.property.bedrooms && normalized.property.bedrooms !== 0) {
    missing.push("bedrooms");
  }
  if (!normalized.property.bathrooms && normalized.property.bathrooms !== 0) {
    missing.push("bathrooms");
  }
  if (!normalized.property.approximate_area_sqm) missing.push("area_sqm");
  if (!normalized.property.current_status.length) missing.push("current_status");
  if (!normalized.property.requested_services.length) {
    missing.push("requested_services");
  }
  if (!normalized.property.timing) missing.push("timing");
  if (!normalized.contact.first_name) missing.push("first_name");
  if (!normalized.contact.last_name) missing.push("last_name");
  if (!normalized.contact.email) missing.push("email");
  if (!normalized.contact.phone) missing.push("phone");

  return missing;
}

function buildPropertyHint(normalized: NormalizedMetaLead) {
  const type = normalized.property.property_type || "il tuo immobile";
  const place = normalized.property.city || normalized.property.province || normalized.property.region;

  return place ? `${type} a ${place}` : type;
}

async function fetchFormMappings(formId: string | null): Promise<MetaFieldMapping[]> {
  if (!formId) return [];

  const supabase = createServiceSupabaseClient();
  const formsTable = supabase.from("meta_forms" as never) as unknown as {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{
          data: { id: string } | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };
  const { data: form } = await formsTable
    .select("id")
    .eq("form_id", formId)
    .maybeSingle();

  if (!form?.id) return [];

  const mappingsTable = supabase.from("meta_field_mappings" as never) as unknown as {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => Promise<{
        data: MetaFieldMapping[] | null;
        error: { message?: string } | null;
      }>;
    };
  };
  const { data, error } = await mappingsTable
    .select("source_field,normalized_field")
    .eq("meta_form_id", form.id);

  if (error) {
    console.warn("Meta field mappings not loaded:", error.message);
    return [];
  }

  return data ?? [];
}
