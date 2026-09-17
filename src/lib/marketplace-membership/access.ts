import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchMarketplaceMembershipSettings } from "./settings";
import { resolveMarketplaceMembershipAccess } from "./policy";
import { loadMarketplaceSubscription } from "./subscription";

export function primeIncludesMarketplace(account: {
  status: string; prime_expires_at: string | null; grace_ends_at: string | null;
} | null, now = Date.now()) {
  if (!account) return false;
  return (account.status === "active" && (!account.prime_expires_at || Date.parse(account.prime_expires_at) > now)) ||
    (account.status === "past_due" && !!account.grace_ends_at && Date.parse(account.grace_ends_at) > now);
}

export async function hasPrimeMarketplaceAccess(db: SupabaseClient<Database>, profileId: string) {
  const { data, error } = await db.from("prime_accounts")
    .select("status,prime_expires_at,grace_ends_at").eq("profile_id", profileId).maybeSingle();
  // A failed lookup must not be mistaken for permission to sell a second membership.
  if (error) throw error;
  return primeIncludesMarketplace(data);
}

export async function getMarketplaceAccess(db: SupabaseClient<Database>, profileId: string) {
  const { settings, storageReady } = await fetchMarketplaceMembershipSettings(db);
  if (!storageReady) throw new Error("Configurazione Marketplace non disponibile.");
  if (!settings.paidAccessEnabled) return "open" as const;
  const hasPrimeAccess = await hasPrimeMarketplaceAccess(db, profileId);
  if (hasPrimeAccess) return "prime" as const;
  const { subscription } = await loadMarketplaceSubscription(db, profileId);
  return resolveMarketplaceMembershipAccess({ paidAccessEnabled: true, hasPrimeAccess,
    subscription: subscription ? { status: subscription.status, trialEndsAt: subscription.trial_ends_at,
      periodEndsAt: subscription.current_period_ends_at } : null });
}
