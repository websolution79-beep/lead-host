import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type {
  AddonProductAdmin,
  AddonSubscriptionSummary,
} from "@/lib/addons/types";

type ServiceClient = SupabaseClient<Database>;
type AddonProductRow = Database["public"]["Tables"]["addon_products"]["Row"];

export async function getMarketingAddonAdminOverview(supabase: ServiceClient) {
  const { data: product, error: productError } = await supabase
    .from("addon_products")
    .select("*")
    .eq("slug", "marketing")
    .single();

  if (productError || !product) {
    throw new Error(productError?.message ?? "Addon Marketing non trovato.");
  }

  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from("addon_subscriptions")
    .select("status, source")
    .eq("addon_product_id", product.id);

  if (subscriptionsError) {
    throw new Error(subscriptionsError.message);
  }

  const summary = (subscriptions ?? []).reduce<AddonSubscriptionSummary>(
    (totals, subscription) => {
      if (subscription.status === "trialing") totals.trialing += 1;
      if (subscription.status === "active") totals.active += 1;
      if (["past_due", "unpaid"].includes(subscription.status)) {
        totals.paymentIssues += 1;
      }
      if (subscription.source === "manual" && subscription.status === "active") {
        totals.manual += 1;
      }

      return totals;
    },
    { trialing: 0, active: 0, paymentIssues: 0, manual: 0 },
  );

  return { product: mapAddonProduct(product), summary };
}

export async function getMarketingAddonId(supabase: ServiceClient) {
  const { data, error } = await supabase
    .from("addon_products")
    .select("id")
    .eq("slug", "marketing")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Addon Marketing non trovato.");
  }

  return data.id;
}

export function mapAddonProduct(product: AddonProductRow): AddonProductAdmin {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    shortDescription: product.short_description ?? "",
    description: product.description ?? "",
    status: product.status,
    isMenuVisible: product.is_menu_visible,
    checkoutEnabled: product.checkout_enabled,
    trialDays: product.trial_days,
    listPriceCents: product.list_price_cents,
    salePriceCents: product.sale_price_cents,
    currency: product.currency,
    billingInterval: product.billing_interval,
    billingIntervalCount: product.billing_interval_count,
    gracePeriodDays: product.grace_period_days,
    cancellationMode: product.cancellation_mode,
    stripeProductId: product.stripe_product_id ?? "",
    stripePriceId: product.stripe_price_id ?? "",
    coverImageUrl: product.cover_image_url ?? "",
    videoUrl: product.video_url ?? "",
    features: toStringArray(product.features),
    termsUrl: product.terms_url,
    updatedAt: product.updated_at,
  };
}

function toStringArray(value: Json): string[] {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is string => typeof item === "string");
}
