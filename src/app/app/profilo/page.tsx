import { AppShell } from "@/components/app-shell";
import { WorkspacePlaceholder } from "@/components/workspace-placeholder";

export default function ProfilePage() {
  return (
    <AppShell section="pm" eyebrow="Profilo" title="Profilo Property Manager">
      <WorkspacePlaceholder
        title="Onboarding PM"
        description="La Fase 5 gestira azienda, Partita IVA, servizi, modalita operativa e aree geografiche."
        items={["Dati azienda", "Servizi offerti", "Aree coperte", "Stato verifica"]}
      />
    </AppShell>
  );
}
