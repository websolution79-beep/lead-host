import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import {
  fetchCommercialSettings,
  resolveLeadPricing,
} from "@/lib/config/commercial-settings";
import { revalidateTag } from "next/cache";
import { MARKETPLACE_LEADS_CACHE_TAG } from "@/lib/cache/tags";
import type { Database } from "@/lib/supabase/database.types";
import { hasAdminPermission } from "@/lib/admin/permissions";
import { notifyPublicLeadPublication } from "@/lib/leads/public-publication";

type RouteContext = {
  params: Promise<{
    ownerRequestId: string;
  }>;
};

const approveSchema = z.object({
  title: z.string().trim().max(140).optional(),
  notes: z.string().trim().max(600).optional(),
  sharedPriceCents: z.number().int().min(100).max(100000).optional(),
  exclusivePriceCents: z.number().int().min(100).max(200000).optional(),
  ownerVerified: z.boolean().optional(),
  sublettingAvailable: z.boolean().optional(),
  visibilityMode: z.enum(["public", "prime_private"]).default("public"),
  primeTargetPropertyManagerId: z.string().uuid().nullable().optional(),
  primeAccessDurationHours: z.number().int().min(1).max(720).optional(),
});

type ServiceClient = SupabaseClient<Database>;

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { ownerRequestId } = await context.params;
    const payload = approveSchema.safeParse(
      await request.json().catch(() => ({})),
    );

    if (!payload.success) {
      return NextResponse.json(
        { error: "Dati approvazione non validi." },
        { status: 400 },
      );
    }

    const { supabase, profile, isSuperAdmin, permissions, teamMemberId } =
      await requireSuperAdmin(request);
    const isPrimePublication = payload.data.visibilityMode === "prime_private";

    if (
      isPrimePublication &&
      !isSuperAdmin &&
      !hasAdminPermission(permissions, "prime", "write")
    ) {
      return NextResponse.json(
        { error: "Non hai il permesso di assegnare lead alla Prime Zone." },
        { status: 403 },
      );
    }

    if (isPrimePublication && !payload.data.primeTargetPropertyManagerId) {
      return NextResponse.json(
        { error: "Seleziona il Property Manager PRIME destinatario." },
        { status: 400 },
      );
    }

    const ownerRequestResult = await fetchOwnerRequestForApproval(
      supabase,
      ownerRequestId,
    );
    const { data: ownerRequest, error: requestError } = ownerRequestResult;

    if (requestError || !ownerRequest) {
      return NextResponse.json(
        { error: "Richiesta non trovata." },
        { status: 404 },
      );
    }

    if (
      payload.data.sublettingAvailable &&
      !ownerRequestResult.sublettingColumnAvailable
    ) {
      return NextResponse.json(
        {
          error:
            "Database non ancora aggiornato per la disponibilità alla sublocazione. Applica la migration e riprova.",
        },
        { status: 409 },
      );
    }

    if (!["to_verify", "pending", "approved"].includes(ownerRequest.status)) {
      return NextResponse.json(
        { error: "Il lead non puo essere pubblicato nello stato attuale." },
        { status: 409 },
      );
    }

    const { data: existingProperty, error: propertyError } = await supabase
      .from("properties")
      .select("id,region,province,city,property_type")
      .eq("owner_request_id", ownerRequestId)
      .maybeSingle();

    if (propertyError) {
      throw propertyError;
    }

    let property = existingProperty;

    if (!property) {
      const { data: insertedProperty, error: propertyInsertError } =
        await supabase
          .from("properties")
          .insert({ owner_request_id: ownerRequestId })
          .select("id,region,province,city,property_type")
          .single();

      if (propertyInsertError || !insertedProperty) {
        throw propertyInsertError ?? new Error("Scheda immobile non creata.");
      }

      property = insertedProperty;
    }

    const leadTitle = payload.data.title || buildLeadTitle(property);
    const { settings } = await fetchCommercialSettings(supabase);
    const ownerVerified = payload.data.ownerVerified ?? ownerRequest.owner_verified;
    const sublettingAvailable =
      payload.data.sublettingAvailable ?? ownerRequest.subletting_available;
    const suggestedPricing = resolveLeadPricing(settings, property, ownerVerified);
    const sharedPriceCents =
      payload.data.sharedPriceCents ?? suggestedPricing.sharedPriceCents;
    const exclusivePriceCents =
      payload.data.exclusivePriceCents ?? suggestedPricing.exclusivePriceCents;
    const qualificationNotes =
      payload.data.notes === undefined || payload.data.notes.length === 0
        ? ownerRequest.qualification_notes
        : payload.data.notes;
    const { data: existingLead, error: existingError } = await supabase
      .from("leads")
      .select("id")
      .eq("owner_request_id", ownerRequestId)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    let leadId = existingLead?.id;

    if (!leadId) {
      const { data: insertedLead, error: insertError } = await supabase
        .from("leads")
        .insert({
          owner_request_id: ownerRequestId,
          property_id: property.id,
          title: leadTitle,
          internal_status: "available",
          public_status: "available",
          shared_price_cents: sharedPriceCents,
          exclusive_price_cents: exclusivePriceCents,
        })
        .select("id")
        .single();

      if (insertError || !insertedLead) {
        if (insertError && isLeadPriceConstraintError(insertError)) {
          return NextResponse.json(
            {
              error:
                "Database non aggiornato per prezzi configurabili. Applica la migration commercial_settings e riprova.",
            },
            { status: 409 },
          );
        }

        throw insertError ?? new Error("Lead non creato.");
      }

      leadId = insertedLead.id;
    } else {
      const { error: titleError } = await supabase
        .from("leads")
        .update({
          title: leadTitle,
          shared_price_cents: sharedPriceCents,
          exclusive_price_cents: exclusivePriceCents,
        })
        .eq("id", leadId);

      if (titleError) {
        if (isLeadPriceConstraintError(titleError)) {
          return NextResponse.json(
            {
              error:
                "Database non aggiornato per prezzi configurabili. Applica la migration commercial_settings e riprova.",
            },
            { status: 409 },
          );
        }

        throw titleError;
      }
    }

    const primeAccessDurationHours =
      payload.data.primeAccessDurationHours ??
      settings.primeDefaultAccessDurationHours;
    const primeAccessUntil = new Date(
      Date.now() + primeAccessDurationHours * 60 * 60 * 1000,
    ).toISOString();
    const { data: publishedLead, error: publishError } = isPrimePublication
      ? await supabase.rpc("assign_lead_to_prime", {
          p_lead_id: leadId,
          p_target_property_manager_id:
            payload.data.primeTargetPropertyManagerId!,
          p_access_until: primeAccessUntil,
          p_actor_profile_id: profile.id,
          p_actor_team_member_id: teamMemberId,
          p_actor_role: isSuperAdmin ? "super_admin" : "account_manager",
        })
      : await supabase.rpc("publish_lead", {
          p_lead_id: leadId,
        });

    if (publishError || !publishedLead) {
      throw publishError ?? new Error("Lead non pubblicato.");
    }

    let { error: updateRequestError } = await supabase
      .from("owner_requests")
      .update({
        status: "published",
        owner_verified: ownerVerified,
        ...(ownerRequestResult.sublettingColumnAvailable
          ? { subletting_available: sublettingAvailable }
          : {}),
        qualification_notes: qualificationNotes,
        status_reason: null,
      })
      .eq("id", ownerRequestId);

    if (
      updateRequestError &&
      isMissingReviewMetadataError(updateRequestError)
    ) {
      const fallback = await supabase
        .from("owner_requests")
        .update({
          status: "published",
          owner_verified: ownerVerified,
          ...(ownerRequestResult.sublettingColumnAvailable
            ? { subletting_available: sublettingAvailable }
            : {}),
          qualification_notes: qualificationNotes,
        })
        .eq("id", ownerRequestId);
      updateRequestError = fallback.error;
    }

    if (updateRequestError) {
      throw updateRequestError;
    }

    await writeAdminAuditLog({
      supabase,
      request,
      actorProfileId: profile.id,
      isSuperAdmin,
      entityType: "owner_request",
      entityId: ownerRequestId,
      action: isPrimePublication
        ? "lead.approved_to_prime_zone"
        : "lead.approved_and_published",
      before: {
        status: ownerRequest.status,
        qualification_notes: ownerRequest.qualification_notes,
      },
      after: {
        status: "published",
        qualification_notes: qualificationNotes,
        lead_id: leadId,
        shared_price_cents: sharedPriceCents,
        exclusive_price_cents: exclusivePriceCents,
        pricing_source: suggestedPricing.label,
        owner_verified: ownerVerified,
        subletting_available: sublettingAvailable,
        visibility_mode: payload.data.visibilityMode,
        prime_target_property_manager_id:
          payload.data.primeTargetPropertyManagerId ?? null,
        prime_access_duration_hours: isPrimePublication
          ? primeAccessDurationHours
          : null,
        prime_access_until: isPrimePublication ? primeAccessUntil : null,
      },
    });

    revalidateTag(MARKETPLACE_LEADS_CACHE_TAG, "max");

    // Lead publication must not wait for one request per PM or for Telegram.
    // `after` keeps the post-publication notifications independent from the admin UI.
    if (!isPrimePublication) {
      after(async () => {
        const result = await notifyPublicLeadPublication(leadId).catch(
          (notificationError) => {
            console.warn(
              "Public lead publication notifications failed:",
              notificationError,
            );
            return null;
          },
        );

        if (result && !result.completed) {
          console.warn("Public lead publication notifications incomplete:", result);
        }
      });
    }

    return NextResponse.json({
      status: isPrimePublication ? "prime_private" : "published",
      lead: publishedLead,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

async function fetchOwnerRequestForApproval(
  supabase: ServiceClient,
  ownerRequestId: string,
) {
  const result = await supabase
    .from("owner_requests")
    .select(
      "id,status,qualification_notes,owner_verified,subletting_available",
    )
    .eq("id", ownerRequestId)
    .single();

  if (!result.error || !isMissingSublettingColumnError(result.error)) {
    return { ...result, sublettingColumnAvailable: true };
  }

  const fallback = await supabase
    .from("owner_requests")
    .select("id,status,qualification_notes,owner_verified")
    .eq("id", ownerRequestId)
    .single();

  return {
    ...fallback,
    data: fallback.data
      ? { ...fallback.data, subletting_available: false }
      : null,
    sublettingColumnAvailable: false,
  };
}

function isMissingSublettingColumnError(error: { code?: string; message?: string }) {
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    Boolean(error.message?.includes("subletting_available"))
  );
}

function buildLeadTitle(property: {
  city: string | null;
  province: string | null;
  region: string | null;
  property_type: string | null;
}) {
  const place =
    property.city ?? property.province ?? property.region ?? "Italia";

  return `${property.property_type ?? "Immobile"} a ${place}`;
}

function isLeadPriceConstraintError(error: {
  code?: string;
  message?: string;
}) {
  return (
    error.code === "23514" &&
    (error.message?.includes("lead_prices_fixed") ?? false)
  );
}

function isMissingReviewMetadataError(error: {
  code?: string;
  message?: string;
}) {
  const message = error.message?.toLowerCase() ?? "";
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    message.includes("status_reason")
  );
}
