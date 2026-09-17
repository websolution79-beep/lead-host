import type Stripe from "stripe";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { syncAddonSubscriptionFromStripe } from "@/lib/addons/stripe-subscriptions";
import { MARKETPLACE_MEMBERSHIP_ROLLOUT_READY } from "./settings";
import { hasPrimeMarketplaceAccess } from "./access";
import { loadMarketplaceSubscription } from "./subscription";
import { cancelMarketplaceRenewalForPrime } from "./prime-cancellation";

export async function reconcilePrimeMarketplace(stripe: Stripe, profileId: string) {
  if (!MARKETPLACE_MEMBERSHIP_ROLLOUT_READY) return;
  const db = createServiceSupabaseClient();
  if (!await hasPrimeMarketplaceAccess(db, profileId)) return;
  const { subscription } = await loadMarketplaceSubscription(db, profileId);
  if (!subscription || subscription.source !== "stripe" || !subscription.stripe_subscription_id) return;
  const updated = await cancelMarketplaceRenewalForPrime(stripe, {
    stripeSubscriptionId: subscription.stripe_subscription_id,
    localSubscriptionId: subscription.id, profileId,
  });
  await syncAddonSubscriptionFromStripe(updated, { reason: "Marketplace incluso nell'accesso PRIME" });
}
