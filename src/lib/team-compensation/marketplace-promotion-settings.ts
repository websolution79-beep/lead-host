import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  marketplacePromotionEngineReady,
  marketplacePromotionSettingsSchema,
  type MarketplacePromotionSettingsResponse,
} from "./marketplace-promotion-config";

type SettingsRow = {
  feature_enabled: boolean;
  marketplace_promotion_enabled: boolean;
  marketplace_promotion_wait_minutes: number;
  marketplace_promotion_sale_cents: number;
};

export async function fetchMarketplacePromotionSettings(
  supabase: SupabaseClient<Database>,
): Promise<MarketplacePromotionSettingsResponse> {
  const fallback: MarketplacePromotionSettingsResponse = {
    settings: { enabled: false, waitMinutes: 0, saleCents: 0 },
    storageReady: false,
    engineReady: false,
    compensationEnabled: false,
  };
  const table = supabase.from("team_compensation_settings" as never) as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: boolean) => {
        maybeSingle: () => Promise<{ data: SettingsRow | null; error: unknown }>;
      };
    };
  };
  try {
    const { data, error } = await table.select(
      "feature_enabled,marketplace_promotion_enabled,marketplace_promotion_wait_minutes,marketplace_promotion_sale_cents",
    ).eq("id", true).maybeSingle();
    if (error || !data) return fallback;
    const parsed = marketplacePromotionSettingsSchema.safeParse({
      enabled: data.marketplace_promotion_enabled,
      waitMinutes: data.marketplace_promotion_wait_minutes,
      saleCents: data.marketplace_promotion_sale_cents,
    });
    if (!parsed.success) return fallback;
    const sales = supabase.from("marketplace_lead_promotion_sales" as never) as unknown as {
      select: (columns: string) => { limit: (count: number) => Promise<{ error: unknown }> };
    };
    const ledger = await sales.select("lead_id,compensation_event_id,reversal_event_id").limit(1);
    return { settings: parsed.data, storageReady: true,
      engineReady: marketplacePromotionEngineReady && !ledger.error,
      compensationEnabled: data.feature_enabled === true };
  } catch {
    return fallback;
  }
}
