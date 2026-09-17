import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getMarketplaceAccess, hasPrimeMarketplaceAccess } from "./access";

function dbWith(rows: Record<string, { data: unknown; error: unknown }>) {
  const queried: string[] = [];
  const db = { from(table: string) {
    queried.push(table);
    const query = { select: () => query, eq: () => query, in: () => query,
      order: () => query, limit: () => query,
      single: async () => rows[table], maybeSingle: async () => rows[table] };
    return query;
  } } as unknown as SupabaseClient<Database>;
  return { db, queried };
}
const settings = (enabled: boolean) => ({ data: { value: { paidAccessEnabled: enabled,
  listPriceCents: 2900, promoEnabled: false, promoPriceCents: null, trialDays: 15 } }, error: null });

test("open Marketplace does not query or require subscriptions", async () => {
  const { db, queried } = dbWith({ settings: settings(false) });
  assert.equal(await getMarketplaceAccess(db, "pm"), "open");
  assert.deepEqual(queried, ["settings"]);
});
test("active PRIME bypasses Marketplace subscription lookup", async () => {
  const { db, queried } = dbWith({ settings: settings(true), prime_accounts: {
    data: { status: "active", prime_expires_at: null, grace_ends_at: null }, error: null } });
  assert.equal(await getMarketplaceAccess(db, "pm"), "prime");
  assert.equal(queried.includes("addon_subscriptions"), false);
});
test("closed Marketplace without entitlements requires membership", async () => {
  const { db } = dbWith({ settings: settings(true), prime_accounts: { data: null, error: null },
    addon_products: { data: { id: "market" }, error: null }, addon_subscriptions: { data: null, error: null } });
  assert.equal(await getMarketplaceAccess(db, "pm"), "required");
});
test("PRIME lookup errors fail closed instead of allowing a duplicate subscription", async () => {
  const { db } = dbWith({ prime_accounts: { data: null, error: new Error("database unavailable") } });
  await assert.rejects(hasPrimeMarketplaceAccess(db, "pm"), /database unavailable/);
});
