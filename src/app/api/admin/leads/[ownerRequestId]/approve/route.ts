import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import {
  fetchCommercialSettings,
  resolveLeadPricing,
} from "@/lib/config/commercial-settings";
import { notifyImmediateNewLead } from "@/lib/email/notifications";

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
});

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { ownerRequestId } = await context.params;
    const payload = approveSchema.safeParse(await request.json().catch(() => ({})));

    if (!payload.success) {
      return NextResponse.json({ error: "Dati approvazione non validi." }, { status: 400 });
    }

    const { supabase, profile } = await requireSuperAdmin(request);

    const { data: ownerRequest, error: requestError } = await supabase
      .from("owner_requests")
      .select("id,status")
      .eq("id", ownerRequestId)
      .single();

    if (requestError || !ownerRequest) {
      return NextResponse.json({ error: "Richiesta non trovata." }, { status: 404 });
    }

    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .select("id,region,province,city,property_type")
      .eq("owner_request_id", ownerRequestId)
      .single();

    if (propertyError || !property) {
      return NextResponse.json(
        { error: "Dati immobile mancanti: impossibile pubblicare." },
        { status: 409 },
      );
    }

    const leadTitle = payload.data.title || buildLeadTitle(property);
    const { settings } = await fetchCommercialSettings(supabase);
    const suggestedPricing = resolveLeadPricing(settings, property);
    const sharedPriceCents =
      payload.data.sharedPriceCents ?? suggestedPricing.sharedPriceCents;
    const exclusivePriceCents =
      payload.data.exclusivePriceCents ?? suggestedPricing.exclusivePriceCents;
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

    const { data: publishedLead, error: publishError } = await supabase.rpc(
      "publish_lead",
      {
        p_lead_id: leadId,
      },
    );

    if (publishError || !publishedLead) {
      throw publishError ?? new Error("Lead non pubblicato.");
    }

    const { error: updateRequestError } = await supabase
      .from("owner_requests")
      .update({
        status: "published",
        qualification_notes: payload.data.notes || null,
      })
      .eq("id", ownerRequestId);

    if (updateRequestError) {
      throw updateRequestError;
    }

    const auditLogs = supabase.from("audit_logs" as never) as unknown as {
      insert: (row: Record<string, unknown>) => Promise<unknown>;
    };

    await auditLogs.insert({
      actor_profile_id: profile.id,
      actor_role: "super_admin",
      entity_type: "owner_request",
      entity_id: ownerRequestId,
      action: "lead.approved_and_published",
      before: { status: ownerRequest.status },
      after: {
        status: "published",
        lead_id: leadId,
        shared_price_cents: sharedPriceCents,
        exclusive_price_cents: exclusivePriceCents,
        pricing_source: suggestedPricing.label,
      },
    });

    await notifyImmediateNewLead({
      id: leadId,
      title: leadTitle,
      city: property.city,
      province: property.province,
      shared_price_cents: sharedPriceCents,
      exclusive_price_cents: exclusivePriceCents,
    });

    return NextResponse.json({ status: "published", lead: publishedLead });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

function buildLeadTitle(property: {
  city: string | null;
  province: string | null;
  region: string | null;
  property_type: string | null;
}) {
  const place = property.city ?? property.province ?? property.region ?? "Italia";

  return `${property.property_type ?? "Immobile"} a ${place}`;
}

function isLeadPriceConstraintError(error: { code?: string; message?: string }) {
  return (
    error.code === "23514" &&
    (error.message?.includes("lead_prices_fixed") ?? false)
  );
}
