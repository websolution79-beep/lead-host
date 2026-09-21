import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { marketplaceMembershipSettingsSchema } from "./policy";

export const MARKETPLACE_MEMBERSHIP_SETTINGS_KEY = "marketplace.membership";
// Enable only after checkout, entitlement checks and renewal recovery are deployed.
export const MARKETPLACE_MEMBERSHIP_ROLLOUT_READY = true;

export async function fetchMarketplaceMembershipSettings(db: SupabaseClient<Database>) {
  const { data, error } = await db.from("settings").select("value")
    .eq("key", MARKETPLACE_MEMBERSHIP_SETTINGS_KEY).maybeSingle();
  if (error) throw error;
  const value = data?.value;
  const stored = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    storageReady: Boolean(data),
    settings: marketplaceMembershipSettingsSchema.parse({
      paidAccessEnabled: false, listPriceCents: null, promoEnabled: false,
      promoPriceCents: null, trialDays: 0, ...stored,
    }),
  };
}
