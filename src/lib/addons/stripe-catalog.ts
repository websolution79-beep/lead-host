import Stripe from "stripe";
import { getEnv } from "@/lib/env";

type StripeAddonCatalogInput = {
  slug: string;
  name: string;
  shortDescription: string;
  salePriceCents: number;
  currency: string;
  billingInterval: "month" | "year";
  billingIntervalCount: number;
  existingProductId: string | null;
  existingPriceId: string | null;
};

export type StripeAddonCatalogResult = {
  productId: string;
  priceId: string;
  priceChanged: boolean;
};

export async function syncStripeAddonCatalog(
  input: StripeAddonCatalogInput,
): Promise<StripeAddonCatalogResult> {
  const secretKey = getEnv("STRIPE_SECRET_KEY");
  if (!secretKey) {
    throw new Error(
      "Stripe non configurato sul server. Verifica STRIPE_SECRET_KEY su Vercel.",
    );
  }

  const stripe = new Stripe(secretKey);
  const product = await ensureProduct(stripe, input);
  const currentPrice = await retrievePrice(stripe, input.existingPriceId);
  const priceMatches = Boolean(
    currentPrice &&
      !currentPrice.deleted &&
      currentPrice.product === product.id &&
      currentPrice.unit_amount === input.salePriceCents &&
      currentPrice.currency === input.currency &&
      currentPrice.type === "recurring" &&
      currentPrice.recurring?.interval === input.billingInterval &&
      currentPrice.recurring.interval_count === input.billingIntervalCount,
  );

  let price: Stripe.Price;
  if (priceMatches && currentPrice && !currentPrice.deleted) {
    price = currentPrice.active
      ? currentPrice
      : await stripe.prices.update(currentPrice.id, { active: true });
  } else {
    price = await findOrCreatePrice(stripe, product.id, input);
  }

  if (product.default_price !== price.id) {
    await stripe.products.update(product.id, { default_price: price.id });
  }

  if (
    currentPrice &&
    !currentPrice.deleted &&
    currentPrice.id !== price.id &&
    currentPrice.active
  ) {
    await stripe.prices.update(currentPrice.id, { active: false });
  }

  return {
    productId: product.id,
    priceId: price.id,
    priceChanged: currentPrice?.id !== price.id,
  };
}

async function ensureProduct(
  stripe: Stripe,
  input: StripeAddonCatalogInput,
): Promise<Stripe.Product> {
  const existing = await retrieveProduct(stripe, input.existingProductId);
  const description = input.shortDescription.trim().slice(0, 500) || undefined;
  const metadata = {
    leadhost_addon_slug: input.slug,
    managed_by: "leadhost",
  };

  if (existing && !existing.deleted) {
    return stripe.products.update(existing.id, {
      active: true,
      name: input.name,
      description,
      metadata,
    });
  }

  return stripe.products.create(
    {
      active: true,
      name: input.name,
      description,
      metadata,
    },
    { idempotencyKey: `leadhost-addon-product-${input.slug}` },
  );
}

async function findOrCreatePrice(
  stripe: Stripe,
  productId: string,
  input: StripeAddonCatalogInput,
) {
  const lookupKey = [
    "leadhost",
    input.slug,
    input.currency,
    input.billingInterval,
    input.billingIntervalCount,
    input.salePriceCents,
  ].join("_");
  const listed = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  const reusable = listed.data.find(
    (candidate) =>
      candidate.product === productId &&
      candidate.unit_amount === input.salePriceCents &&
      candidate.currency === input.currency &&
      candidate.recurring?.interval === input.billingInterval &&
      candidate.recurring.interval_count === input.billingIntervalCount,
  );

  if (reusable) {
    return reusable.active
      ? reusable
      : stripe.prices.update(reusable.id, { active: true });
  }

  return stripe.prices.create(
    {
      active: true,
      product: productId,
      currency: input.currency,
      unit_amount: input.salePriceCents,
      recurring: {
        interval: input.billingInterval,
        interval_count: input.billingIntervalCount,
      },
      lookup_key: lookupKey,
      metadata: {
        leadhost_addon_slug: input.slug,
        managed_by: "leadhost",
      },
    },
    { idempotencyKey: `leadhost-addon-price-${lookupKey}` },
  );
}

async function retrieveProduct(stripe: Stripe, productId: string | null) {
  if (!productId) return null;

  try {
    return await stripe.products.retrieve(productId);
  } catch (error) {
    if (isMissingStripeResource(error)) return null;
    throw error;
  }
}

async function retrievePrice(stripe: Stripe, priceId: string | null) {
  if (!priceId) return null;

  try {
    return await stripe.prices.retrieve(priceId);
  } catch (error) {
    if (isMissingStripeResource(error)) return null;
    throw error;
  }
}

function isMissingStripeResource(error: unknown) {
  return error instanceof Stripe.errors.StripeInvalidRequestError && error.code === "resource_missing";
}
