import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { PropertyManagerApiError, propertyManagerApiErrorResponse, requirePropertyManager } from "@/lib/api/property-manager-auth";
import { getBillingReadiness } from "@/lib/billing/server";
import { getEnv, getRequestAppUrl } from "@/lib/env";
import { CURRENT_TERMS_VERSION } from "@/lib/legal/terms";
import { getPrimeAccessState } from "@/lib/prime/access";
import { fetchMarketplaceMembershipSettings, MARKETPLACE_MEMBERSHIP_ROLLOUT_READY } from "@/lib/marketplace-membership/settings";
import { marketplaceMonthlyPrice } from "@/lib/marketplace-membership/policy";
import { ensureMarketplacePrice } from "@/lib/marketplace-membership/stripe-price";
import { loadMarketplaceSubscription } from "@/lib/marketplace-membership/subscription";
import { marketplaceCheckoutParams, marketplaceCheckoutSnapshotSchema } from "@/lib/marketplace-membership/checkout-params";

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile } = await requirePropertyManager(request);
    if (!z.object({ termsAccepted: z.literal(true) }).safeParse(await request.json().catch(() => null)).success) {
      throw new PropertyManagerApiError(422, "Accetta i Termini e Condizioni prima di proseguire.");
    }
    const { settings, storageReady } = await fetchMarketplaceMembershipSettings(supabase);
    if (!MARKETPLACE_MEMBERSHIP_ROLLOUT_READY || !storageReady || !settings.paidAccessEnabled) {
      throw new PropertyManagerApiError(409, "Gli abbonamenti Marketplace non sono ancora disponibili.");
    }
    const { product, subscription: current } = await loadMarketplaceSubscription(supabase, profile.id);
    if (product.status !== "active" || !product.checkout_enabled || !product.stripe_product_id) {
      throw new PropertyManagerApiError(409, "Checkout Marketplace non disponibile.");
    }
    if ((await getPrimeAccessState(profile.id, supabase)).hasAccess) {
      throw new PropertyManagerApiError(409, "Il Marketplace e gia incluso nel tuo accesso PRIME.");
    }
    const billing = await getBillingReadiness(supabase, profile.id);
    if (!billing.complete) return NextResponse.json({ error: "Completa i dati di fatturazione nel profilo.",
      code: "BILLING_PROFILE_INCOMPLETE", missingLabels: billing.missingLabels }, { status: 422 });
    const key = getEnv("STRIPE_SECRET_KEY");
    if (!key) throw new PropertyManagerApiError(503, "Stripe non configurato.");
    const stripe = new Stripe(key);
    if (current && (current.status !== "incomplete" || current.stripe_subscription_id || current.source !== "stripe")) {
      throw new PropertyManagerApiError(409, "Hai gia un abbonamento Marketplace o un pagamento in elaborazione.");
    }
    let pending = current;
    if (!pending) {
      const amount = marketplaceMonthlyPrice(settings);
      if (amount === null) throw new PropertyManagerApiError(409, "Prezzo Marketplace non configurato.");
      const priceId = await ensureMarketplacePrice(stripe, product.stripe_product_id, amount);
      const { data: trial, error: trialError } = await supabase.from("addon_trial_usage").select("id")
        .eq("addon_product_id", product.id).eq("profile_id", profile.id).maybeSingle();
      if (trialError) throw trialError;
      const { data, error } = await supabase.from("addon_subscriptions").insert({
        addon_product_id: product.id, profile_id: profile.id, status: "incomplete", source: "stripe",
        stripe_price_id: priceId, metadata: {
          terms_version: CURRENT_TERMS_VERSION, terms_accepted_at: new Date().toISOString(),
          monthly_price_cents: amount, trial_days_requested: trial ? 0 : settings.trialDays,
          checkout_email: profile.email, checkout_app_url: getRequestAppUrl(request),
        },
      }).select("*").single();
      if (error?.code === "23505") throw new PropertyManagerApiError(409, "Attivazione gia in corso. Riprova tra pochi secondi.");
      if (error) throw error;
      pending = data;
    }
    const snapshot = marketplaceCheckoutSnapshotSchema.parse(pending.metadata);
    const customer = pending.stripe_customer_id || (await stripe.customers.create({
      email: String(snapshot.checkout_email), metadata: { leadhost_profile_id: profile.id },
    }, { idempotencyKey: `marketplace-customer-${pending.id}` })).id;
    if (!pending.stripe_customer_id) {
      const { error } = await supabase.from("addon_subscriptions").update({ stripe_customer_id: customer })
        .eq("id", pending.id);
      if (error) throw error;
    }
    let session: Stripe.Checkout.Session | null = null;
    if (typeof snapshot.stripe_checkout_session_id === "string") {
      session = await stripe.checkout.sessions.retrieve(snapshot.stripe_checkout_session_id);
    } else if (Date.now() - Date.parse(pending.created_at) > 23 * 60 * 60_000) {
      // Do not recreate an uncertain checkout after Stripe's idempotency window.
      for await (const candidate of stripe.checkout.sessions.list({ customer, limit: 100 })) {
        if (candidate.client_reference_id === pending.id) { session = candidate; break; }
      }
      if (!session) throw new PropertyManagerApiError(409, "Attivazione da verificare. Contatta l'assistenza prima di riprovare.");
    }
    if (!session) {
      if (!pending.stripe_price_id) throw new PropertyManagerApiError(409, "Prezzo dell'attivazione non disponibile.");
      session = await stripe.checkout.sessions.create(marketplaceCheckoutParams({ snapshot,
        customer, subscriptionId: pending.id, productId: product.id, profileId: profile.id,
        priceId: pending.stripe_price_id }), { idempotencyKey: `marketplace-checkout-${pending.id}` });
    }
    if (session.status === "expired") {
      const { error } = await supabase.from("addon_subscriptions").update({ status: "expired" })
        .eq("id", pending.id).eq("status", "incomplete").is("stripe_subscription_id", null);
      if (error) throw error;
      throw new PropertyManagerApiError(409, "La sessione precedente e scaduta. Riprova per crearne una nuova.");
    }
    if (session.status !== "open" || !session.url) {
      throw new PropertyManagerApiError(409, "Pagamento gia completato o in elaborazione. Aggiorna il profilo tra pochi secondi.");
    }
    const { error } = await supabase.from("addon_subscriptions").update({ metadata: {
      ...pending.metadata as Record<string, string | number | boolean | null>, stripe_checkout_session_id: session.id,
      stripe_checkout_expires_at: new Date(session.expires_at * 1000).toISOString(),
    } }).eq("id", pending.id).eq("status", "incomplete");
    if (error) throw error;
    return NextResponse.json({ ok: true, checkoutUrl: session.url });
  } catch (error) {
    // An uncertain network result must never release the subscription reservation.
    return propertyManagerApiErrorResponse(error);
  }
}
