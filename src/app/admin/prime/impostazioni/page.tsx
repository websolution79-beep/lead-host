import { AppShell } from "@/components/app-shell";
import { AdminPrimeSettings } from "@/components/admin-prime-settings";

export default function AdminPrimeSettingsPage() {
  return (
    <AppShell section="admin" eyebrow="Configurazione" title="Impostazioni PRIME">
      <AdminPrimeSettings />
    </AppShell>
  );
}
