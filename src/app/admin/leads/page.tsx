import { AppShell } from "@/components/app-shell";
import { WorkspacePlaceholder } from "@/components/workspace-placeholder";

export default function AdminLeadsPage() {
  return (
    <AppShell section="admin" eyebrow="Lead" title="Gestione lead">
      <WorkspacePlaceholder
        title="Stati interni"
        description="Il Super Admin vedra stati reali distinti, mentre il marketplace mostrera solo stati pubblici neutri."
        items={["Disponibili", "Un slot venduto", "Venduti due PM", "Esclusivi", "Ritirati dopo 7 giorni"]}
      />
    </AppShell>
  );
}
