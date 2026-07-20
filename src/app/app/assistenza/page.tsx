import { AppShell } from "@/components/app-shell";
import { WorkspacePlaceholder } from "@/components/workspace-placeholder";

export default function SupportPage() {
  return (
    <AppShell section="pm" eyebrow="Assistenza" title="Assistenza">
      <WorkspacePlaceholder
        title="Supporto e segnalazioni"
        description="La Fase 10 aggiungera la funzione Segnala un problema con revisione manuale Super Admin."
        items={["Numero inesistente", "Email inesistente", "Duplicato", "Altro"]}
      />
    </AppShell>
  );
}
