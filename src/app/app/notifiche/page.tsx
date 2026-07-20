import { AppShell } from "@/components/app-shell";
import { WorkspacePlaceholder } from "@/components/workspace-placeholder";

export default function NotificationsPage() {
  return (
    <AppShell section="pm" eyebrow="Notifiche" title="Notifiche">
      <WorkspacePlaceholder
        title="Avvisi compatibili"
        description="La Fase 10 introdurra notifiche interne ed email senza includere dati personali del proprietario."
        items={["Nuovi lead compatibili", "Acquisti completati", "Segnalazioni", "Aggiornamenti profilo"]}
      />
    </AppShell>
  );
}
