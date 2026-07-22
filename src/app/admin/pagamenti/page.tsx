import { AdminPaymentsConsole } from "@/components/admin-payments-console";
import { AppShell } from "@/components/app-shell";

export default function AdminPaymentsPage() {
  return (
    <AppShell section="admin" eyebrow="Pagamenti" title="Pagamenti">
      <AdminPaymentsConsole />
    </AppShell>
  );
}
