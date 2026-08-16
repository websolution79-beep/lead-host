import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const STARTUP_PRODUCT_SETTING = "prime.stripe_startup_product_id";
const BUNDLE_PRODUCT_SETTING = "prime.stripe_bundle_product_id";

type ServiceClient = SupabaseClient<Database>;

type PrimeProduct = Pick<
  Database["public"]["Tables"]["addon_products"]["Row"],
  "id" | "name" | "stripe_product_id" | "currency"
>;

export type PrimeStripeCatalog = {
  membershipProductId: string;
  membershipPriceId: string;
  startupPriceId: string | null;
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

  const membershipProductId = await getOrCreateBundleProduct(stripe, supabase, product.id);
  const startupProductId = await getOrCreateStartupProduct(stripe, supabase, product.id);
  const currency = product.currency.toLowerCase();
  const recurringTotalCents = recurringServiceFeeCents + monthlyWalletRechargeCents;
  await stripe.products.update(membershipProductId, {
    name: "Lead Host PRIME",
    description: `Dal secondo mese: ${formatEuro(monthlyWalletRechargeCents)} di credito Wallet + ${formatEuro(recurringServiceFeeCents)} di servizio PRIME`,
  });
  const membershipPrice = await getOrCreatePrice({
    stripe,
    productId: membershipProductId,
    amountCents: recurringTotalCents,
    currency,
    lookupKey: priceLookupKey("prime_bundle_monthly", recurringTotalCents, currency),
    recurring: true,
    nickname: "PRIME mensile con ricarica Wallet",
    component: "prime_bundle",
  });
  const adjustmentCents = firstMonthServiceFeeCents - recurringServiceFeeCents;
  const adjustmentPrice = adjustmentCents > 0
    ? await getOrCreatePrice({
        stripe,
        productId: startupProductId,
        amountCents: adjustmentCents,
        currency,
        lookupKey: priceLookupKey("prime_startup_fee", adjustmentCents, currency),
        recurring: false,
        nickname: "Lead Host PRIME Startup",
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
    membershipPriceId: membershipPrice.id,
    startupPriceId: adjustmentPrice?.id ?? null,
  };
}

async function getOrCreateBundleProduct(
  stripe: Stripe,
  supabase: ServiceClient,
  addonProductId: string,
) {
  const { data: stored, error: storedError } = await supabase
    .from("settings")
    .select("value")
    .eq("key", BUNDLE_PRODUCT_SETTING)
    .maybeSingle();
  if (storedError) throw storedError;

  const storedId = typeof stored?.value === "string" ? stored.value : null;
  if (storedId) return storedId;

  const created = await stripe.products.create(
    {
      name: "Lead Host PRIME",
      description: "Servizio PRIME mensile con credito Wallet incluso",
      metadata: {
        leadhost_addon_product_id: addonProductId,
        leadhost_product: "prime_bundle",
      },
    },
    { idempotencyKey: `prime-bundle-product-${addonProductId}` },
  );
  const { error } = await supabase.from("settings").upsert(
    { key: BUNDLE_PRODUCT_SETTING, value: created.id },
    { onConflict: "key" },
  );
  if (error) throw error;
  return created.id;
}

async function getOrCreateStartupProduct(
  stripe: Stripe,
  supabase: ServiceClient,
  addonProductId: string,
) {
  const { data: stored, error: storedError } = await supabase
    .from("settings")
    .select("value")
    .eq("key", STARTUP_PRODUCT_SETTING)
    .maybeSingle();
  if (storedError) throw storedError;

  const storedId = typeof stored?.value === "string" ? stored.value : null;
  if (storedId) return storedId;

  const created = await stripe.products.create(
    {
      name: "Lead Host PRIME Startup",
      description: "Costo una tantum per attivazione servizio PRIME",
      metadata: {
        leadhost_addon_product_id: addonProductId,
        leadhost_product: "prime_startup",
      },
    },
    { idempotencyKey: `prime-startup-product-${addonProductId}` },
  );
  const { error } = await supabase.from("settings").upsert(
    { key: STARTUP_PRODUCT_SETTING, value: created.id },
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

function formatEuro(cents: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}
