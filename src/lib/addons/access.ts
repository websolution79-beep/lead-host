import { cache } from "react";
import type { NextRequest } from "next/server";
import { AdminApiError } from "@/lib/admin/auth";
import { getAuthenticatedProfileContext } from "@/lib/auth/profile-context";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

const accessStatuses = ["trialing", "active", "past_due"] as const;

type ProductRow = Database["public"]["Tables"]["addon_products"]["Row"];
type SubscriptionRow = Database["public"]["Tables"]["addon_subscriptions"]["Row"];
type ProductWithAccess = Pick<
  ProductRow,
  | "id"
  | "name"
  | "short_description"
  | "description"
  | "status"
  | "is_menu_visible"
  | "checkout_enabled"
  | "trial_days"
  | "list_price_cents"
  | "sale_price_cents"
  | "currency"
  | "cover_image_url"
  | "video_url"
  | "features"
  | "terms_url"
> & {
  addon_subscriptions: Array<
    Pick<
      SubscriptionRow,
      | "id"
      | "status"
      | "source"
      | "trial_ends_at"
      | "current_period_ends_at"
      | "access_expires_at"
    >
  >;
};

export type MarketingAddonState = {
  product: {
    id: string;
    name: string;
    shortDescription: string;
    description: string;
    trialDays: number;
    listPriceCents: number | null;
    salePriceCents: number | null;
    currency: string;
    coverImageUrl: string;
    videoUrl: string;
    features: string[];
    termsUrl: string;
    checkoutEnabled: boolean;
  } | null;
  menuVisible: boolean;
  hasAccess: boolean;
  accessSource: "super_admin" | "manual" | "stripe" | null;
  accessExpiresAt: string | null;
};

export const getMarketingAddonState = cache(
  async (profileId: string, isSuperAdmin: boolean): Promise<MarketingAddonState> => {
    const supabase = createServiceSupabaseClient();
    const { data, error: productError } = await supabase
      .from("addon_products")
      .select(
        "id,name,short_description,description,status,is_menu_visible,checkout_enabled,trial_days,list_price_cents,sale_price_cents,currency,cover_image_url,video_url,features,terms_url,addon_subscriptions(id,status,source,trial_ends_at,current_period_ends_at,access_expires_at)",
      )
      .eq("slug", "marketing")
      .eq("addon_subscriptions.profile_id", profileId)
      .in("addon_subscriptions.status", [...accessStatuses])
      .maybeSingle();

    if (productError) throw productError;
    const product = data as unknown as ProductWithAccess | null;
    if (!product) {
      return {
        product: null,
        menuVisible: isSuperAdmin,
        hasAccess: isSuperAdmin,
        accessSource: isSuperAdmin ? "super_admin" : null,
        accessExpiresAt: null,
      };
    }

    const subscription = isSuperAdmin ? null : product.addon_subscriptions[0] ?? null;

    const now = Date.now();
    const accessExpiresAt = subscription?.access_expires_at ?? null;
    const manualAccessValid = Boolean(
      subscription?.source === "manual" &&
        subscription.status === "active" &&
        (!accessExpiresAt || new Date(accessExpiresAt).getTime() > now),
    );
    const stripeAccessValid = Boolean(
      subscription?.source === "stripe" &&
        (subscription.status === "active" ||
          (subscription.status === "trialing" &&
            (!subscription.trial_ends_at ||
              new Date(subscription.trial_ends_at).getTime() > now)) ||
          (subscription.status === "past_due" &&
            subscription.current_period_ends_at &&
            new Date(subscription.current_period_ends_at).getTime() > now)),
    );
    const hasAccess = isSuperAdmin || manualAccessValid || stripeAccessValid;
    const publicMenuVisible = product.status === "active" && product.is_menu_visible;

    return {
      product: {
        id: product.id,
        name: product.name,
        shortDescription: product.short_description ?? "",
        description: product.description ?? "",
        trialDays: product.trial_days,
        listPriceCents: product.list_price_cents,
        salePriceCents: product.sale_price_cents,
        currency: product.currency,
        coverImageUrl: product.cover_image_url ?? "",
        videoUrl: product.video_url ?? "",
        features: Array.isArray(product.features)
          ? product.features.filter((item): item is string => typeof item === "string")
          : [],
        termsUrl: product.terms_url,
        checkoutEnabled: product.checkout_enabled,
      },
      menuVisible: isSuperAdmin || hasAccess || publicMenuVisible,
      hasAccess,
      accessSource: isSuperAdmin
        ? "super_admin"
        : hasAccess
          ? subscription?.source ?? null
          : null,
      accessExpiresAt,
    };
  },
);

export async function requireMarketingAddonAccess(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new AdminApiError(401, "Sessione non valida.");

  const context = await getAuthenticatedProfileContext(token);
  if (!context || context.profile.status !== "active") {
    throw new AdminApiError(401, "Sessione non valida.");
  }

  const isSuperAdmin = context.roles.includes("super_admin");
  const isPropertyManager = context.roles.includes("property_manager");
  if (!isSuperAdmin && !isPropertyManager) {
    throw new AdminApiError(403, "Accesso al Modulo Marketing non disponibile.");
  }

  const addon = await getMarketingAddonState(context.profile.id, isSuperAdmin);
  if (!addon.hasAccess) {
    throw new AdminApiError(403, "Il Modulo Marketing non è attivo sul tuo account.");
  }

  return {
    supabase: createServiceSupabaseClient(),
    profile: context.profile,
    isSuperAdmin,
    addon,
  };
}
