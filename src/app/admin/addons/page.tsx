import { AppShell } from "@/components/app-shell";
import { AdminAddonsConsole } from "@/components/admin-addons-console";

export default function AdminAddonsPage() {
  return (
    <AppShell section="admin" eyebrow="Configurazione" title="Addons">
      <AdminAddonsConsole />
    </AppShell>
  );
}
