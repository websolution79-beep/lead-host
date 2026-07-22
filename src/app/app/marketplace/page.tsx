import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { MarketplaceFilters } from "@/components/marketplace-filters";
import { demoLeads } from "@/lib/domain/sample-data";
import {
  applyPropertyManagerMatching,
  getPublishedMarketplaceLeads,
} from "@/lib/domain/marketplace-leads";
import { getServerSessionProfile } from "@/lib/auth/server-session";

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
  const session = await getServerSessionProfile();

  if (!session) {
    redirect("/login?redirect=/app/marketplace");
  }

  const realLeads = await getPublishedMarketplaceLeads();
  const leads = await applyPropertyManagerMatching({
    profileId: session.profile.id,
    leads: realLeads.length > 0 ? realLeads : demoLeads,
  });

  return (
    <AppShell section="pm" eyebrow="Marketplace" title="Opportunità disponibili">
      <MarketplaceFilters leads={leads} />
    </AppShell>
  );
}
