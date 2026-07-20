import { AppShell } from "@/components/app-shell";
import { WorkspacePlaceholder } from "@/components/workspace-placeholder";

export default function MetaAcquisitionPage() {
  return (
    <AppShell section="admin" eyebrow="Meta Lead Ads" title="Integrazione Meta">
      <WorkspacePlaceholder
        title="Form e mapping"
        description="La Fase 4 aggiungera webhook, verifica firma, recupero lead e field mapping configurabile."
        items={["Account Meta", "Pagina Facebook", "Form ID", "Field mapping", "Retry e idempotenza"]}
      />
    </AppShell>
  );
}
