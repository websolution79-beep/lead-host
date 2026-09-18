import type Stripe from "stripe";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { syncAddonSubscriptionFromStripe } from "@/lib/addons/stripe-subscriptions";
import { MARKETPLACE_MEMBERSHIP_ROLLOUT_READY } from "./settings";
import { hasPrimeMarketplaceAccess } from "./access";
import { loadMarketplaceSubscription } from "./subscription";
import { cancelMarketplaceRenewalForPrime } from "./prime-cancellation";
import { assertMarketplaceSubscription, recoverPendingMarketplaceCheckout } from "./pending-checkout";
import { sendMarketplaceEmails } from "./emails";

export async function reconcilePrimeMarketplace(stripe: Stripe, profileId: string) {
  if (!MARKETPLACE_MEMBERSHIP_ROLLOUT_READY) return;
  const db = createServiceSupabaseClient();
  const primeActive = await hasPrimeMarketplaceAccess(db, profileId);
  const { product, subscription } = await loadMarketplaceSubscription(db, profileId);
  if (!subscription || subscription.source !== "stripe") return;
  let stripeSubscriptionId = subscription.stripe_subscription_id;
  if (!stripeSubscriptionId && subscription.status === "incomplete") {
    const meta = subscription.metadata && typeof subscription.metadata === "object" && !Array.isArray(subscription.metadata)
      ? subscription.metadata : {};
    const recovered = await recoverPendingMarketplaceCheckout(stripe, {
      id: subscription.id, profileId, productId: product.id, customerId: subscription.stripe_customer_id,
      sessionId: typeof meta.stripe_checkout_session_id === "string" ? meta.stripe_checkout_session_id : null,
      createdAt: subscription.created_at,
    }, primeActive);
    if (recovered.state === "expired") {
      const { error } = await db.from("addon_subscriptions").update({ status: "expired" })
        .eq("id", subscription.id).eq("status", "incomplete").is("stripe_subscription_id", null);
      if (error) throw error;
      return;
    }
    if (recovered.state === "pending") return;
    await syncAddonSubscriptionFromStripe(recovered.subscription, {
      reason: "Recupero checkout Marketplace completato", checkoutSessionId: recovered.sessionId,
    });
    stripeSubscriptionId = recovered.subscription.id;
  }
  if (!stripeSubscriptionId) return;
  if (!primeActive) {
    if (subscription.status === "incomplete") {
      const current = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      assertMarketplaceSubscription(current, { id: subscription.id, profileId, productId: product.id });
      await syncAddonSubscriptionFromStripe(current, { reason: "Recupero stato abbonamento Marketplace" });
    }
    await sendMarketplaceEmails(subscription.id);
    return;
  }
  const updated = await cancelMarketplaceRenewalForPrime(stripe, {
    stripeSubscriptionId,
    localSubscriptionId: subscription.id, profileId,
  });
  await syncAddonSubscriptionFromStripe(updated, { reason: "Marketplace incluso nell'accesso PRIME" });
  await sendMarketplaceEmails(subscription.id);
}
