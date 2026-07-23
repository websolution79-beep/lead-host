import { AppShell } from "@/components/app-shell";
import { AdminReportsConsole } from "@/components/admin-reports-console";

export default function AdminReportsPage() {
  return (
    <AppShell section="admin" eyebrow="Assistenza" title="Richieste di assistenza">
      <AdminReportsConsole />
    </AppShell>
  );
}
