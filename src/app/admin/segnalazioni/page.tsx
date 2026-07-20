import { AppShell } from "@/components/app-shell";
import { WorkspacePlaceholder } from "@/components/workspace-placeholder";

export default function AdminReportsPage() {
  return (
    <AppShell section="admin" eyebrow="Segnalazioni" title="Segnalazioni">
      <WorkspacePlaceholder
        title="Revisione manuale"
        description="Le segnalazioni non generano rimborso automatico."
        items={["Numero inesistente", "Email inesistente", "Duplicato", "Immobile inesistente", "Altro"]}
      />
    </AppShell>
  );
}
