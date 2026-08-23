import { AppShell } from "@/components/app-shell";
import { MarketingManagedPropertyDetail } from "@/components/marketing-managed-property-detail";

export default async function MarketingManagedPropertyPage({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  return <AppShell section="pm" eyebrow="Marketing / Gestione immobili" title="Scheda immobile"><MarketingManagedPropertyDetail propertyId={propertyId} /></AppShell>;
}
