import { AppShell } from "@/components/app-shell";
import { WorkspacePlaceholder } from "@/components/workspace-placeholder";

export default function AdminPropertyManagersPage() {
  return (
    <AppShell section="admin" eyebrow="Property Manager" title="Property Manager">
      <WorkspacePlaceholder
        title="Verifica e controllo"
        description="Gestione di PM non verificati, verificati e sospesi."
        items={["Non verificati", "Verificati", "Sospesi", "Aree operative"]}
      />
    </AppShell>
  );
}
