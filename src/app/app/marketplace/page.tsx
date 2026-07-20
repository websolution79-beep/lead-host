import { AppShell } from "@/components/app-shell";
import { MarketplaceFilters } from "@/components/marketplace-filters";
import { demoLeads } from "@/lib/domain/sample-data";
import { getPublishedMarketplaceLeads } from "@/lib/domain/marketplace-leads";

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
  const realLeads = await getPublishedMarketplaceLeads();
  const leads = realLeads.length > 0 ? realLeads : demoLeads;

  return (
    <AppShell section="pm" eyebrow="Marketplace" title="Opportunita disponibili">
      <MarketplaceFilters leads={leads} />
    </AppShell>
  );
}
