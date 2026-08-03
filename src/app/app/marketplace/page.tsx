import { AppShell } from "@/components/app-shell";
import { MarketplaceFilters } from "@/components/marketplace-filters";
import { fetchCommercialSettings } from "@/lib/config/commercial-settings";
import { getPublishedMarketplaceLeads } from "@/lib/domain/marketplace-leads";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
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
