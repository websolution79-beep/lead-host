import type Stripe from "stripe";

// Immutable prices preserve existing subscriptions and in-progress checkouts.
export async function ensureMarketplacePrice(
  stripe: Stripe,
  productId: string,
  amount: number,
) {
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000) {
    throw new Error("Prezzo Marketplace non valido.");
  }
  const lookupKey = `leadhost_marketplace_${productId}_eur_month_${amount}`;
  const listed = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  const existing = listed.data[0];
  if (existing) {
    if (existing.product !== productId || existing.unit_amount !== amount ||
      existing.currency !== "eur" || existing.recurring?.interval !== "month" ||
      existing.recurring.interval_count !== 1 || existing.billing_scheme !== "per_unit") {
      throw new Error("Il prezzo Stripe non corrisponde alla configurazione Marketplace.");
    }
    if (!existing.active) throw new Error("Il prezzo Marketplace risulta archiviato su Stripe.");
    return existing.id;
  }
  const price = await stripe.prices.create({
    product: productId, currency: "eur", unit_amount: amount,
    recurring: { interval: "month", interval_count: 1 },
    lookup_key: lookupKey,
    metadata: { leadhost_addon_slug: "marketplace", managed_by: "leadhost" },
  }, { idempotencyKey: lookupKey });
  return price.id;
}
