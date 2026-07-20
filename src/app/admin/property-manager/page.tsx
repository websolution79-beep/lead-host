import { AppShell } from "@/components/app-shell";
import { AdminPropertyManagersConsole } from "@/components/admin-property-managers-console";

export default function AdminPropertyManagersPage() {
  return (
    <AppShell section="admin" eyebrow="Property Manager" title="Property Manager">
      <AdminPropertyManagersConsole />
    </AppShell>
  );
}
