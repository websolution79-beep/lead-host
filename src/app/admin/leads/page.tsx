import { AppShell } from "@/components/app-shell";
import { AdminLeadsConsole } from "@/components/admin-leads-console";

export default function AdminLeadsPage() {
  return (
    <AppShell section="admin" eyebrow="Lead" title="Gestione lead">
      <AdminLeadsConsole />
    </AppShell>
  );
}
