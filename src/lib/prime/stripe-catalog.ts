import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const WALLET_PRODUCT_SETTING = "prime.stripe_wallet_product_id";

type ServiceClient = SupabaseClient<Database>;

type PrimeProduct = Pick<
  Database["public"]["Tables"]["addon_products"]["Row"],
  "id" | "name" | "stripe_product_id" | "currency"
>;

export type PrimeStripeCatalog = {
  membershipProductId: string;
  walletProductId: string;
  membershipPriceId: string;
  walletPriceId: string;
  initialAdjustmentPriceId: string | null;
};

export async function ensurePrimeStripeCatalog({
  stripe,
  supabase,
  product,
  recurringServiceFeeCents,
  firstMonthServiceFeeCents,
  monthlyWalletRechargeCents,
}: {
  stripe: Stripe;
  supabase: ServiceClient;
  product: PrimeProduct;
  recurringServiceFeeCents: number;
  firstMonthServiceFeeCents: number;
  monthlyWalletRechargeCents: number;
}): Promise<PrimeStripeCatalog> {
  if (firstMonthServiceFeeCents < recurringServiceFeeCents) {
    throw new Error("Il prezzo PRIME del primo mese non può essere inferiore al rinnovo.");
  }

  const membershipProductId = product.stripe_product_id || await createMembershipProduct(
    stripe,
    product,
  );
  if (!product.stripe_product_id) {
    const { error } = await supabase
      .from("addon_products")
      .update({ stripe_product_id: membershipProductId })
      .eq("id", product.id)
      .is("stripe_product_id", null);
    if (error) throw error;
  }

  const walletProductId = await getOrCreateWalletProduct(stripe, supabase, product.id);
  const currency = product.currency.toLowerCase();
  const membershipPrice = await getOrCreatePrice({
    stripe,
    productId: membershipProductId,
    amountCents: recurringServiceFeeCents,
    currency,
    lookupKey: priceLookupKey("prime_membership_monthly", recurringServiceFeeCents, currency),
    recurring: true,
    nickname: "Membership PRIME mensile",
    component: "membership",
  });
  const walletPrice = await getOrCreatePrice({
    stripe,
    productId: walletProductId,
    amountCents: monthlyWalletRechargeCents,
    currency,
    lookupKey: priceLookupKey("prime_wallet_monthly", monthlyWalletRechargeCents, currency),
    recurring: true,
    nickname: "Ricarica Wallet mensile PRIME",
    component: "wallet_recharge",
  });
  const adjustmentCents = firstMonthServiceFeeCents - recurringServiceFeeCents;
  const adjustmentPrice = adjustmentCents > 0
    ? await getOrCreatePrice({
        stripe,
        productId: membershipProductId,
        amountCents: adjustmentCents,
        currency,
        lookupKey: priceLookupKey("prime_initial_adjustment", adjustmentCents, currency),
        recurring: false,
        nickname: "Quota iniziale PRIME",
        component: "initial_adjustment",
      })
    : null;

  const { error: productUpdateError } = await supabase
    .from("addon_products")
    .update({
      stripe_price_id: membershipPrice.id,
      sale_price_cents: recurringServiceFeeCents,
      status: "active",
      is_menu_visible: true,
      checkout_enabled: true,
      grace_period_days: 3,
      cancellation_mode: "period_end",
    })
    .eq("id", product.id);
  if (productUpdateError) throw productUpdateError;

  return {
    membershipProductId,
    walletProductId,
    membershipPriceId: membershipPrice.id,
    walletPriceId: walletPrice.id,
    initialAdjustmentPriceId: adjustmentPrice?.id ?? null,
  };
}

async function createMembershipProduct(stripe: Stripe, product: PrimeProduct) {
  const created = await stripe.products.create(
    {
      name: product.name,
      description: "Membership mensile Lead Host PRIME",
      metadata: {
        leadhost_addon_product_id: product.id,
        leadhost_product: "prime_membership",
      },
    },
    { idempotencyKey: `prime-membership-product-${product.id}` },
  );
  return created.id;
}

async function getOrCreateWalletProduct(
  stripe: Stripe,
  supabase: ServiceClient,
  addonProductId: string,
) {
  const { data: stored, error: storedError } = await supabase
    .from("settings")
    .select("value")
    .eq("key", WALLET_PRODUCT_SETTING)
    .maybeSingle();
  if (storedError) throw storedError;

  const storedId = typeof stored?.value === "string" ? stored.value : null;
  if (storedId) return storedId;

  const created = await stripe.products.create(
    {
      name: "Lead Host PRIME - Ricarica Wallet",
      description: "Credito Wallet mensile incluso nell’abbonamento PRIME",
      metadata: {
        leadhost_addon_product_id: addonProductId,
        leadhost_product: "prime_wallet_recharge",
      },
    },
    { idempotencyKey: `prime-wallet-product-${addonProductId}` },
  );
  const { error } = await supabase.from("settings").upsert(
    { key: WALLET_PRODUCT_SETTING, value: created.id },
    { onConflict: "key" },
  );
  if (error) throw error;
  return created.id;
}

async function getOrCreatePrice({
  stripe,
  productId,
  amountCents,
  currency,
  lookupKey,
  recurring,
  nickname,
  component,
}: {
  stripe: Stripe;
  productId: string;
  amountCents: number;
  currency: string;
  lookupKey: string;
  recurring: boolean;
  nickname: string;
  component: string;
}) {
  const existing = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });
  if (existing.data[0]) return existing.data[0];

  return stripe.prices.create(
    {
      product: productId,
      unit_amount: amountCents,
      currency,
      lookup_key: lookupKey,
      nickname,
      metadata: { prime_component: component },
      ...(recurring ? { recurring: { interval: "month" as const } } : {}),
    },
    { idempotencyKey: `create-${lookupKey}` },
  );
}

function priceLookupKey(prefix: string, amountCents: number, currency: string) {
  return `leadhost_${prefix}_${amountCents}_${currency}`;
}
