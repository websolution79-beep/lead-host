import type Stripe from "stripe";

export type PendingMarketplaceCheckout = {
  id: string; profileId: string; productId: string; customerId: string | null;
  sessionId: string | null; createdAt: string;
};

function assertSession(session: Stripe.Checkout.Session, expected: PendingMarketplaceCheckout) {
  const customer = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (session.mode !== "subscription" || session.client_reference_id !== expected.id ||
    session.metadata?.addon_slug !== "marketplace" || session.metadata.profile_id !== expected.profileId ||
    session.metadata.addon_product_id !== expected.productId || session.metadata.addon_subscription_id !== expected.id ||
    !expected.customerId || customer !== expected.customerId) {
    throw new Error("Checkout Marketplace non coerente: nessuna modifica eseguita.");
  }
}

export function assertMarketplaceSubscription(subscription: Stripe.Subscription, expected: {
  id: string; profileId: string; productId: string;
}) {
  if (subscription.metadata.addon_slug !== "marketplace" || subscription.metadata.profile_id !== expected.profileId ||
    subscription.metadata.addon_subscription_id !== expected.id || subscription.metadata.addon_product_id !== expected.productId) {
    throw new Error("Abbonamento Marketplace non coerente: sincronizzazione interrotta.");
  }
}

export async function recoverPendingMarketplaceCheckout(stripe: Stripe, expected: PendingMarketplaceCheckout,
  primeActive: boolean): Promise<{ state: "pending" } | { state: "expired" } | { state: "complete"; sessionId: string; subscription: Stripe.Subscription }> {
  let session: Stripe.Checkout.Session | null = null;
  if (expected.sessionId) session = await stripe.checkout.sessions.retrieve(expected.sessionId);
  else if (expected.customerId) {
    for await (const candidate of stripe.checkout.sessions.list({ customer: expected.customerId, limit: 100 })) {
      if (candidate.client_reference_id !== expected.id) continue;
      if (session) throw new Error("Piu checkout Marketplace da verificare: prenotazione mantenuta.");
      session = candidate;
    }
  }
  if (!session) {
    // A request may still be creating the session. Never infer expiration from age alone.
    if (Date.now() - Date.parse(expected.createdAt) > 23 * 60 * 60_000) {
      throw new Error("Checkout Marketplace non rintracciato: verifica manuale richiesta.");
    }
    return { state: "pending" };
  }
  assertSession(session, expected);
  if (primeActive && session.status === "open") {
    try { session = await stripe.checkout.sessions.expire(session.id); }
    catch (error) {
      // Completion can win the race with expiration. Only Stripe's confirmed state is authoritative.
      session = await stripe.checkout.sessions.retrieve(session.id);
      if (session.status !== "complete" && session.status !== "expired") throw error;
    }
    assertSession(session, expected);
  }
  if (session.status === "expired") return { state: "expired" };
  if (session.status !== "complete") return { state: "pending" };
  const id = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!id) throw new Error("Checkout completato senza abbonamento: prenotazione mantenuta.");
  const subscription = await stripe.subscriptions.retrieve(id);
  assertMarketplaceSubscription(subscription, expected);
  return { state: "complete", sessionId: session.id, subscription };
}
