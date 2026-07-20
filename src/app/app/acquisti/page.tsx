import { AppShell } from "@/components/app-shell";
import { WorkspacePlaceholder } from "@/components/workspace-placeholder";

export default function PurchasesPage() {
  return (
    <AppShell section="pm" eyebrow="Acquisti" title="Storico acquisti">
      <WorkspacePlaceholder
        title="Pagamenti e fatturazione"
        description="La Fase 7 colleghera Stripe Checkout, webhook e riconciliazione pagamenti."
        items={["Condivisi 29 EUR", "Esclusivi 50 EUR", "Rimborsi", "Ricevute"]}
      />
    </AppShell>
  );
}
