import { AppShell } from "@/components/app-shell";
import { AdminPrimeConsole } from "@/components/admin-prime-console";

export default function AdminPrimePage() {
  return (
    <AppShell section="admin" eyebrow="Lead Host PRIME" title="Gestione PM Prime">
      <AdminPrimeConsole />
    </AppShell>
  );
}
