import type Stripe from "stripe";

export async function cancelMarketplaceRenewalForPrime(stripe: Stripe, expected: {
  stripeSubscriptionId: string; localSubscriptionId: string; profileId: string;
}) {
  const current = await stripe.subscriptions.retrieve(expected.stripeSubscriptionId);
  if (current.metadata.addon_slug !== "marketplace" || current.metadata.profile_id !== expected.profileId ||
    current.metadata.addon_subscription_id !== expected.localSubscriptionId) {
    throw new Error("Abbonamento Marketplace non coerente: rinnovi non modificati.");
  }
  if (["canceled", "incomplete_expired"].includes(current.status) || current.cancel_at_period_end) return current;
  if (current.status === "incomplete") return current;
  return stripe.subscriptions.update(current.id, { cancel_at_period_end: true,
    metadata: { ...current.metadata, marketplace_cancellation_reason: "included_in_prime" } });
}
