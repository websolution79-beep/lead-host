import { AppShell } from "@/components/app-shell";
import { MarketplaceFilters } from "@/components/marketplace-filters";
import { demoLeads } from "@/lib/domain/sample-data";

export default function MarketplacePage() {
  return (
    <AppShell section="pm" eyebrow="Marketplace" title="Opportunita disponibili">
      <MarketplaceFilters leads={demoLeads} />
    </AppShell>
  );
}
