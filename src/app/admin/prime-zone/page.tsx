import { AppShell } from "@/components/app-shell";
import { AdminPrimeZoneConsole } from "@/components/admin-prime-zone-console";

export default function AdminPrimeZonePage() {
  return (
    <AppShell section="admin" eyebrow="Lead Host PRIME" title="Prime Zone">
      <AdminPrimeZoneConsole />
    </AppShell>
  );
}
