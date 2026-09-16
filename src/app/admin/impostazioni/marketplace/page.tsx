import { AppShell } from "@/components/app-shell";
import { AdminMarketplaceMembershipSettings } from "@/components/admin-marketplace-membership-settings";

export default function MarketplaceSettingsPage() {
  return <AppShell section="admin" eyebrow="Impostazioni" title="Impostazioni Marketplace">
    <AdminMarketplaceMembershipSettings />
  </AppShell>;
}
