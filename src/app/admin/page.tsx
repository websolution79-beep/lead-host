import { AppShell } from "@/components/app-shell";
import { AdminDashboardConsole } from "@/components/admin-dashboard-console";

export default function AdminDashboardPage() {
  return (
    <AppShell section="admin" eyebrow="Super Admin" title="Dashboard">
      <AdminDashboardConsole />
    </AppShell>
  );
}
