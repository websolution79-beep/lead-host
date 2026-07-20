import { AppShell } from "@/components/app-shell";
import { WorkspacePlaceholder } from "@/components/workspace-placeholder";

export default function AdminPaymentsPage() {
  return (
    <AppShell section="admin" eyebrow="Pagamenti" title="Pagamenti">
      <WorkspacePlaceholder
        title="Stripe"
        description="Monitoraggio checkout, webhook, pagamenti completati, falliti, annullati e rimborsi."
        items={["Completati", "Falliti", "Annullati", "Webhook", "Rimborsi"]}
      />
    </AppShell>
  );
}
