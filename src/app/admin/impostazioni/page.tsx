import { AppShell } from "@/components/app-shell";
import { WorkspacePlaceholder } from "@/components/workspace-placeholder";

export default function AdminSettingsPage() {
  return (
    <AppShell section="admin" eyebrow="Impostazioni" title="Impostazioni">
      <WorkspacePlaceholder
        title="Regole configurabili"
        description="Le regole commerciali fondamentali restano bloccate; le finestre di visibilita e le modalita di approvazione sono configurabili."
        items={["Visibilita non disponibili", "Approvazione manuale", "Pubblicazione automatica", "Regole qualita"]}
      />
    </AppShell>
  );
}
