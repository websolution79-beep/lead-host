import { AppShell } from "@/components/app-shell";
import { MarketplaceFilters } from "@/components/marketplace-filters";
import { fetchCommercialSettings } from "@/lib/config/commercial-settings";
import { getPublishedMarketplaceLeads } from "@/lib/domain/marketplace-leads";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { getMarketplacePageAccess } from "@/lib/marketplace-membership/page-access";
import MarketplaceMembershipPage from "@/components/marketplace-membership-page";

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
  const { access } = await getMarketplacePageAccess();
  if (access === "required") return <MarketplaceMembershipPage />;
  const supabase = createServiceSupabaseClient();
  const [leads, { settings }] = await Promise.all([
    getPublishedMarketplaceLeads(),
    fetchCommercialSettings(supabase),
  ]);

  return (
    <AppShell section="pm" eyebrow="Marketplace" title="Opportunità disponibili">
      <MarketplaceFilters
        leads={leads}
        sharedPurchasesEnabled={settings.sharedPurchasesEnabled}
      />
    </AppShell>
  );
}
