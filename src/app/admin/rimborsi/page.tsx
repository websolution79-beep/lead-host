import { AppShell } from "@/components/app-shell";
import { WorkspacePlaceholder } from "@/components/workspace-placeholder";

export default function AdminRefundsPage() {
  return (
    <AppShell section="admin" eyebrow="Rimborsi" title="Rimborsi">
      <WorkspacePlaceholder
        title="Valutazione Super Admin"
        description="Workflow predisposto per richieste, decisione manuale, pagamento e audit log."
        items={["In attesa", "Approvati", "Respinti", "Pagati"]}
      />
    </AppShell>
  );
}
