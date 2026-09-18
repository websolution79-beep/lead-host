import { AppShell } from "@/components/app-shell";
import { MarketplaceMembershipOffer } from "@/components/marketplace-membership-offer";
import { getMarketplacePageAccess } from "@/lib/marketplace-membership/page-access";
import { fetchMarketplaceMembershipSettings, MARKETPLACE_MEMBERSHIP_ROLLOUT_READY } from "@/lib/marketplace-membership/settings";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { marketplaceMonthlyPrice } from "@/lib/marketplace-membership/policy";
import { loadMarketplaceSubscription } from "@/lib/marketplace-membership/subscription";

export default async function MarketplaceMembershipPage() {
  const { session, access } = await getMarketplacePageAccess();
  const db = createServiceSupabaseClient();
  const { settings } = await fetchMarketplaceMembershipSettings(db);
  const { data: product, error } = await db.from("addon_products")
    .select("id,status,checkout_enabled").eq("slug", "marketplace").single();
  if (error) throw error;
  const { data: trial, error: trialError } = await db.from("addon_trial_usage").select("id")
    .eq("addon_product_id", product.id).eq("profile_id", session.profile.id).maybeSingle();
  if (trialError) throw trialError;
  const { subscription } = await loadMarketplaceSubscription(db, session.profile.id);
  const meta = subscription?.metadata && typeof subscription.metadata === "object" && !Array.isArray(subscription.metadata)
    ? subscription.metadata : {};
  const agreedPrice = typeof meta.monthly_price_cents === "number" ? meta.monthly_price_cents : null;
  const trialDays = subscription
    ? subscription.status === "incomplete" && typeof meta.trial_days_requested === "number" ? meta.trial_days_requested : 0
    : trial ? 0 : settings.trialDays;
  return <AppShell section={access === "staff" ? "admin" : "pm"} eyebrow="Marketplace" title="Opportunità disponibili">
    <MarketplaceMembershipOffer amountCents={agreedPrice ?? marketplaceMonthlyPrice(settings)}
      listPriceCents={agreedPrice === null ? settings.listPriceCents : null} trialDays={trialDays}
      access={access} enabled={MARKETPLACE_MEMBERSHIP_ROLLOUT_READY && settings.paidAccessEnabled &&
        product.status === "active" && product.checkout_enabled && access === "required"} />
  </AppShell>;
}
