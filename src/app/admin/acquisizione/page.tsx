import { AppShell } from "@/components/app-shell";
import { WorkspacePlaceholder } from "@/components/workspace-placeholder";

export default function AcquisitionPage() {
  return (
    <AppShell section="admin" eyebrow="Acquisizione" title="Tutte le richieste">
      <WorkspacePlaceholder
        title="Pipeline multicanale"
        description="Landing Lead Host e Meta Lead Ads confluiscono nello stesso modello normalizzato."
        items={["Tutte", "Landing Lead Host", "Meta Lead Ads", "Da completare", "Da verificare"]}
      />
    </AppShell>
  );
}
