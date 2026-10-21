import { z } from "zod";

// Release readiness is separate from the opt-in database flag (off by default).
export const marketplacePromotionEngineReady = true;

export const marketplacePromotionSettingsSchema = z.object({
  enabled: z.boolean(),
  waitMinutes: z.number().int().min(0).max(525_600),
  saleCents: z.number().int().min(0).max(1_000_000),
}).strict();

export type MarketplacePromotionSettings = z.infer<typeof marketplacePromotionSettingsSchema>;
export type MarketplacePromotionSettingsResponse = {
  settings: MarketplacePromotionSettings;
  storageReady: boolean;
  engineReady: boolean;
  compensationEnabled: boolean;
};

export function parseMarketplacePromotionDraft(wait: string, euros: string) {
  const minutes = wait.trim();
  const amount = euros.trim().replace(",", ".");
  if (!/^\d+$/.test(minutes) || !/^\d+(\.\d{1,2})?$/.test(amount)) return null;
  const parsed = marketplacePromotionSettingsSchema.safeParse({
    enabled: false,
    waitMinutes: Number(minutes),
    saleCents: Math.round(Number(amount) * 100),
  });
  return parsed.success ? parsed.data : null;
}
