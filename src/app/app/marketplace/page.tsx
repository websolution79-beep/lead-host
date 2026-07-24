import { AppShell } from "@/components/app-shell";
import { MarketplaceFilters } from "@/components/marketplace-filters";
import { getPublishedMarketplaceLeads } from "@/lib/domain/marketplace-leads";

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
  const leads = await getPublishedMarketplaceLeads();

  return (
    <AppShell section="pm" eyebrow="Marketplace" title="Opportunità disponibili">
      <MarketplaceFilters leads={leads} />
    </AppShell>
  );
}
