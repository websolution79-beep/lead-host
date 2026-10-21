import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { marketplacePromotionEngineReady, marketplacePromotionSettingsSchema, parseMarketplacePromotionDraft } from "./marketplace-promotion-config";
import { fetchMarketplacePromotionSettings } from "./marketplace-promotion-settings";

test("promotion settings accept zero and reject invalid or extra fields", () => {
  assert.equal(marketplacePromotionEngineReady, true);
  assert.deepEqual(parseMarketplacePromotionDraft("0", "0,00"), { enabled: false, waitMinutes: 0, saleCents: 0 });
  assert.deepEqual(parseMarketplacePromotionDraft("60", "12,50"), { enabled: false, waitMinutes: 60, saleCents: 1250 });
  assert.equal(parseMarketplacePromotionDraft("1.5", "5"), null);
  assert.equal(parseMarketplacePromotionDraft("", "5"), null);
  assert.equal(parseMarketplacePromotionDraft("1", ""), null);
  assert.equal(parseMarketplacePromotionDraft("1", "1.234"), null);
  assert.equal(parseMarketplacePromotionDraft("1", "1e3"), null);
  assert.equal(parseMarketplacePromotionDraft("1", "-1"), null);
  assert.equal(parseMarketplacePromotionDraft("525601", "1"), null);
  assert.equal(parseMarketplacePromotionDraft("1", "10000.01"), null);
  assert.equal(marketplacePromotionSettingsSchema.safeParse({ enabled: false, waitMinutes: 0, saleCents: 0, featureEnabled: true }).success, false);
});

test("settings read only new columns; unavailable storage fails closed", async () => {
  let columns = "";
  const client = (data: unknown, error: unknown = null, salesError: unknown = null) => ({
    from: (table: string) => {
      if (table === "marketplace_lead_promotion_sales") return { select: () => ({ limit: async () => ({ error: salesError }) }) };
      assert.equal(table, "team_compensation_settings");
      return { select: (select: string) => {
        columns = select;
        return { eq: (column: string, value: boolean) => {
          assert.equal(column, "id");
          assert.equal(value, true);
          return { maybeSingle: async () => ({ data, error }) };
        } };
      } };
    },
  }) as unknown as SupabaseClient<Database>;
  const row = { feature_enabled: true, marketplace_promotion_enabled: false, marketplace_promotion_wait_minutes: 60, marketplace_promotion_sale_cents: 500 };
  const good = await fetchMarketplacePromotionSettings(client(row));
  assert.deepEqual(good, { settings: { enabled: false, waitMinutes: 60, saleCents: 500 }, storageReady: true, engineReady: true, compensationEnabled: true });
  assert.equal(columns.split(",").length, 4);
  const unavailable = await fetchMarketplacePromotionSettings(client(row, null, { code: "42P01" }));
  assert.equal(unavailable.storageReady, true);
  assert.equal(unavailable.engineReady, false);
  assert.equal((await fetchMarketplacePromotionSettings(client({ ...row, feature_enabled: false }))).compensationEnabled, false);
  for (const bad of [await fetchMarketplacePromotionSettings(client(null)), await fetchMarketplacePromotionSettings(client(row, { code: "42703" })), await fetchMarketplacePromotionSettings(client({ ...row, marketplace_promotion_sale_cents: -1 }))]) {
    assert.equal(bad.storageReady, false);
    assert.equal(bad.settings.enabled, false);
    assert.equal(bad.engineReady, false);
  }
});
