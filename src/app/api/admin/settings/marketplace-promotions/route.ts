import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import {
  AdminApiError,
  adminApiErrorResponse,
  requireSuperAdmin,
} from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { MARKETPLACE_LEADS_CACHE_TAG } from "@/lib/cache/tags";
import {
  fetchMarketplacePromotions,
  getEffectivePromotionStatus,
  type MarketplacePromotion,
} from "@/lib/config/marketplace-promotions";

const ruleSchema = z.object({
  id: z.string().uuid(),
  mode: z.enum(["shared", "exclusive"]),
  basePriceCents: z.number().int().min(100).max(200000),
  promotionalPriceCents: z.number().int().min(100).max(200000),
}).refine((rule) => rule.promotionalPriceCents < rule.basePriceCents, {
  message: "Il prezzo promozionale deve essere inferiore al prezzo normale.",
});

const promotionInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  startsAt: z.string().datetime().nullable(),
  endsAt: z.string().datetime().nullable(),
  applyShared: z.boolean(),
  applyExclusive: z.boolean(),
  rules: z.array(ruleSchema).min(1).max(30),
  targetStatus: z.enum(["draft", "scheduled", "active"]),
}).refine((input) => input.applyShared || input.applyExclusive, {
  message: "Seleziona almeno una modalità di acquisto.",
}).refine(
  (input) => input.targetStatus !== "scheduled" || Boolean(input.startsAt && input.endsAt),
  { message: "Per programmare servono data di inizio e fine." },
).refine(
  (input) => !input.startsAt || !input.endsAt || input.endsAt > input.startsAt,
  { message: "La fine deve essere successiva all'inizio." },
);

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("activate"), id: z.string().uuid() }),
  z.object({ action: z.literal("end"), id: z.string().uuid() }),
  z.object({ action: z.literal("cancel"), id: z.string().uuid() }),
]);

const updatePromotionSchema = promotionInputSchema.and(
  z.object({ id: z.string().uuid() }),
);

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const [{ promotions, storageReady }, leadsResult] = await Promise.all([
      fetchMarketplacePromotions(supabase),
      supabase
        .from("leads")
        .select("id,title,shared_price_cents,exclusive_price_cents")
        .not("published_at", "is", null)
        .in("internal_status", ["available", "one_slot_sold"])
        .gt("expires_at", new Date().toISOString())
        .order("published_at", { ascending: false }),
    ]);

    if (leadsResult.error) throw leadsResult.error;

    return NextResponse.json({
      promotions: promotions.map((promotion) => ({
        ...promotion,
        effectiveStatus: getEffectivePromotionStatus(promotion),
      })),
      availableLeads: leadsResult.data ?? [],
      storageReady,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile, isSuperAdmin } = await requireSuperAdmin(request);
    const input = promotionInputSchema.parse(await request.json());
    const { promotions, storageReady } = await fetchMarketplacePromotions(supabase);

    if (!storageReady) {
      return NextResponse.json(
        { error: "Applica la migration marketplace_price_promotions prima di procedere." },
        { status: 409 },
      );
    }

    const applicableRules = input.rules.filter((rule) =>
      rule.mode === "shared" ? input.applyShared : input.applyExclusive,
    );
    if (!applicableRules.length) {
      return NextResponse.json(
        { error: "Aggiungi almeno una fascia per la modalità di acquisto selezionata." },
        { status: 422 },
      );
    }

    validatePromotionAvailability(promotions, input.targetStatus, input.startsAt, input.endsAt);
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("marketplace_price_promotions")
      .insert({
        name: input.name,
        status: input.targetStatus,
        starts_at: input.targetStatus === "active" ? now : input.startsAt,
        ends_at: input.endsAt,
        apply_shared: input.applyShared,
        apply_exclusive: input.applyExclusive,
        rules: applicableRules,
        created_by: profile.id,
        activated_by: input.targetStatus === "active" ? profile.id : null,
        activated_at: input.targetStatus === "active" ? now : null,
      })
      .select("*")
      .single();

    if (error) throw error;

    await writeAdminAuditLog({
      supabase,
      request,
      actorProfileId: profile.id,
      isSuperAdmin,
      entityType: "marketplace_price_promotion",
      entityId: data.id,
      action: `promotion.${input.targetStatus}`,
      after: data,
    });
    invalidateMarketplace();

    return NextResponse.json({ ok: true, promotion: data });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile, isSuperAdmin } = await requireSuperAdmin(request);
    const input = actionSchema.parse(await request.json());
    const { promotions, storageReady } = await fetchMarketplacePromotions(supabase);

    if (!storageReady) {
      return NextResponse.json(
        { error: "Applica la migration marketplace_price_promotions prima di procedere." },
        { status: 409 },
      );
    }

    const promotion = promotions.find((item) => item.id === input.id);
    if (!promotion) {
      return NextResponse.json({ error: "Promozione non trovata." }, { status: 404 });
    }

    const before = promotion;
    const now = new Date().toISOString();
    let update: DatabasePromotionUpdate;

    if (input.action === "activate") {
      if (["ended", "cancelled"].includes(promotion.status)) {
        return NextResponse.json(
          { error: "Una promozione terminata non può essere riattivata. Creane una nuova." },
          { status: 409 },
        );
      }
      validatePromotionAvailability(promotions, "active", now, promotion.ends_at, promotion.id);
      update = {
        status: "active",
        starts_at: now,
        activated_at: now,
        activated_by: profile.id,
      };
    } else if (input.action === "end") {
      update = {
        status: "ended",
        ends_at: now,
        ended_at: now,
        ended_by: profile.id,
      };
    } else {
      if (getEffectivePromotionStatus(promotion) === "active") {
        return NextResponse.json(
          { error: "Una promozione attiva deve essere terminata, non annullata." },
          { status: 409 },
        );
      }
      update = {
        status: "cancelled",
        ended_at: now,
        ended_by: profile.id,
      };
    }

    const { data, error } = await supabase
      .from("marketplace_price_promotions")
      .update(update)
      .eq("id", input.id)
      .select("*")
      .single();

    if (error) throw error;

    await writeAdminAuditLog({
      supabase,
      request,
      actorProfileId: profile.id,
      isSuperAdmin,
      entityType: "marketplace_price_promotion",
      entityId: input.id,
      action: `promotion.${input.action}`,
      before,
      after: data,
    });
    invalidateMarketplace();

    return NextResponse.json({ ok: true, promotion: data });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { supabase, profile, isSuperAdmin } = await requireSuperAdmin(request);
    const input = updatePromotionSchema.parse(await request.json());
    const { promotions, storageReady } = await fetchMarketplacePromotions(supabase);

    if (!storageReady) {
      return NextResponse.json(
        { error: "Applica la migration marketplace_price_promotions prima di procedere." },
        { status: 409 },
      );
    }

    const promotion = promotions.find((item) => item.id === input.id);
    if (!promotion) {
      return NextResponse.json({ error: "Promozione non trovata." }, { status: 404 });
    }
    if (!["draft", "scheduled"].includes(promotion.status)) {
      return NextResponse.json(
        { error: "Puoi modificare soltanto bozze e promozioni non ancora iniziate." },
        { status: 409 },
      );
    }

    const applicableRules = input.rules.filter((rule) =>
      rule.mode === "shared" ? input.applyShared : input.applyExclusive,
    );
    if (!applicableRules.length) {
      return NextResponse.json(
        { error: "Aggiungi almeno una fascia per la modalità di acquisto selezionata." },
        { status: 422 },
      );
    }

    validatePromotionAvailability(
      promotions,
      input.targetStatus,
      input.startsAt,
      input.endsAt,
      input.id,
    );
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("marketplace_price_promotions")
      .update({
        name: input.name,
        status: input.targetStatus,
        starts_at: input.targetStatus === "active" ? now : input.startsAt,
        ends_at: input.endsAt,
        apply_shared: input.applyShared,
        apply_exclusive: input.applyExclusive,
        rules: applicableRules,
        activated_at: input.targetStatus === "active" ? now : null,
        activated_by: input.targetStatus === "active" ? profile.id : null,
      })
      .eq("id", input.id)
      .select("*")
      .single();

    if (error) throw error;

    await writeAdminAuditLog({
      supabase,
      request,
      actorProfileId: profile.id,
      isSuperAdmin,
      entityType: "marketplace_price_promotion",
      entityId: input.id,
      action: `promotion.updated_${input.targetStatus}`,
      before: promotion,
      after: data,
    });
    invalidateMarketplace();

    return NextResponse.json({ ok: true, promotion: data });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

type DatabasePromotionUpdate = {
  status: "active" | "ended" | "cancelled";
  starts_at?: string;
  ends_at?: string;
  activated_at?: string;
  activated_by?: string;
  ended_at?: string;
  ended_by?: string;
};

function validatePromotionAvailability(
  promotions: MarketplacePromotion[],
  targetStatus: "draft" | "scheduled" | "active",
  startsAt: string | null,
  endsAt: string | null,
  ignoredId?: string,
) {
  if (targetStatus === "draft") return;

  const targetStart = targetStatus === "active" ? Date.now() : new Date(startsAt!).getTime();
  const targetEnd = endsAt ? new Date(endsAt).getTime() : Number.POSITIVE_INFINITY;
  if (targetEnd <= targetStart) {
    throw new AdminApiError(422, "La fine della promozione deve essere futura e successiva all'inizio.");
  }
  const overlaps = promotions.some((promotion) => {
    if (promotion.id === ignoredId) return false;
    if (["ended", "cancelled", "draft"].includes(promotion.status)) return false;

    const effectiveStatus = getEffectivePromotionStatus(promotion);
    if (effectiveStatus === "ended" || effectiveStatus === "cancelled") return false;

    const existingStart = promotion.status === "active"
      ? promotion.activated_at
        ? new Date(promotion.activated_at).getTime()
        : Date.now()
      : new Date(promotion.starts_at!).getTime();
    const existingEnd = promotion.ends_at
      ? new Date(promotion.ends_at).getTime()
      : Number.POSITIVE_INFINITY;

    return targetStart < existingEnd && existingStart < targetEnd;
  });

  if (overlaps) {
    throw new AdminApiError(
      409,
      "Esiste già una promozione attiva o programmata nello stesso periodo.",
    );
  }
}

function invalidateMarketplace() {
  revalidateTag(MARKETPLACE_LEADS_CACHE_TAG, "max");
  revalidatePath("/app/marketplace", "layout");
  revalidatePath("/admin/marketplace", "layout");
}
