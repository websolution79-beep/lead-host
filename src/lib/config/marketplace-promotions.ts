import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

type ServiceClient = SupabaseClient<Database>;
type PromotionRow = Database["public"]["Tables"]["marketplace_price_promotions"]["Row"];

export type PromotionPurchaseMode = "shared" | "exclusive";
export type MarketplacePromotionStatus = PromotionRow["status"];

export type MarketplacePromotionRule = {
  id: string;
  mode: PromotionPurchaseMode;
  basePriceCents: number;
  promotionalPriceCents: number;
};

export type MarketplacePromotion = Omit<PromotionRow, "rules"> & {
  rules: MarketplacePromotionRule[];
};

export type EffectivePromotionPrice = {
  amountCents: number;
  baseAmountCents: number;
  promotionId: string | null;
  promotionName: string | null;
};

export async function fetchMarketplacePromotions(supabase: ServiceClient) {
  const { data, error } = await supabase
    .from("marketplace_price_promotions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingPromotionStorageError(error)) {
      return { promotions: [], storageReady: false };
    }
    throw error;
  }

  return {
    promotions: (data ?? []).map(mapPromotionRow),
    storageReady: true,
  };
}

export async function fetchEffectiveMarketplacePromotion(
  supabase: ServiceClient,
  at = new Date(),
) {
  const { data, error } = await supabase
    .from("marketplace_price_promotions")
    .select("*")
    .in("status", ["active", "scheduled"])
    .order("activated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingPromotionStorageError(error)) {
      return { promotion: null, storageReady: false };
    }
    throw error;
  }

  const promotions = (data ?? []).map(mapPromotionRow);
  const promotion =
    promotions.find((item) => getEffectivePromotionStatus(item, at) === "active") ??
    null;

  return { promotion, storageReady: true };
}

export function resolvePromotionalPrice(
  promotion: MarketplacePromotion | null,
  mode: PromotionPurchaseMode,
  baseAmountCents: number,
): EffectivePromotionPrice {
  if (!promotion) {
    return {
      amountCents: baseAmountCents,
      baseAmountCents,
      promotionId: null,
      promotionName: null,
    };
  }

  const modeEnabled =
    mode === "shared" ? promotion.apply_shared : promotion.apply_exclusive;
  const rule = modeEnabled
    ? promotion.rules.find(
        (item) => item.mode === mode && item.basePriceCents === baseAmountCents,
      )
    : null;

  return {
    amountCents: rule?.promotionalPriceCents ?? baseAmountCents,
    baseAmountCents,
    promotionId: rule ? promotion.id : null,
    promotionName: rule ? promotion.name : null,
  };
}

export function getEffectivePromotionStatus(
  promotion: MarketplacePromotion,
  at = new Date(),
): MarketplacePromotionStatus {
  if (promotion.status === "cancelled" || promotion.status === "ended") {
    return promotion.status;
  }

  const timestamp = at.getTime();
  const startsAt = promotion.starts_at
    ? new Date(promotion.starts_at).getTime()
    : null;
  const endsAt = promotion.ends_at ? new Date(promotion.ends_at).getTime() : null;

  if (endsAt !== null && endsAt <= timestamp) return "ended";
  if (promotion.status === "active") return "active";
  if (startsAt !== null && startsAt <= timestamp) return "active";
  return promotion.status;
}

export function parsePromotionRules(value: Json): MarketplacePromotionRule[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];

    const id = typeof entry.id === "string" ? entry.id : crypto.randomUUID();
    const mode = entry.mode;
    const basePriceCents = entry.basePriceCents;
    const promotionalPriceCents = entry.promotionalPriceCents;

    if (
      (mode !== "shared" && mode !== "exclusive") ||
      typeof basePriceCents !== "number" ||
      typeof promotionalPriceCents !== "number"
    ) {
      return [];
    }

    return [{ id, mode, basePriceCents, promotionalPriceCents }];
  });
}

export function isMissingPromotionStorageError(error: {
  code?: string;
  message?: string;
}) {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    Boolean(error.message?.includes("marketplace_price_promotions"))
  );
}

function mapPromotionRow(row: PromotionRow): MarketplacePromotion {
  return {
    ...row,
    rules: parsePromotionRules(row.rules),
  };
}
