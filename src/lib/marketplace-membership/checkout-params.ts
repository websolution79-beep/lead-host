import type Stripe from "stripe";
import { z } from "zod";

export const marketplaceCheckoutSnapshotSchema = z.object({
  terms_version: z.string().min(1), terms_accepted_at: z.string().datetime(),
  monthly_price_cents: z.number().int().positive(),
  trial_days_requested: z.number().int().min(0).max(365),
  checkout_email: z.string().email(), checkout_app_url: z.string().url(),
}).passthrough();

export function marketplaceCheckoutParams(input: {
  snapshot: z.infer<typeof marketplaceCheckoutSnapshotSchema>;
  customer: string; subscriptionId: string; productId: string; profileId: string; priceId: string;
}): Stripe.Checkout.SessionCreateParams {
  const { snapshot, customer, subscriptionId, productId, profileId, priceId } = input;
  const metadata = { kind: "addon_subscription", addon_slug: "marketplace", addon_product_id: productId,
    addon_subscription_id: subscriptionId, profile_id: profileId,
    terms_version: snapshot.terms_version, trial_days_requested: String(snapshot.trial_days_requested) };
  return {
    mode: "subscription", customer, client_reference_id: subscriptionId, locale: "it",
    payment_method_collection: "always", payment_method_types: ["card"],
    success_url: `${snapshot.checkout_app_url}/app/profilo?marketplace_checkout=success#abbonamento-marketplace`,
    cancel_url: `${snapshot.checkout_app_url}/app/marketplace?checkout=cancelled`,
    metadata, subscription_data: { metadata,
      ...(snapshot.trial_days_requested > 0 ? { trial_period_days: snapshot.trial_days_requested } : {}) },
    line_items: [{ price: priceId, quantity: 1 }],
  };
}
