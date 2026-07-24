import { AdminRefundsConsole } from "@/components/admin-refunds-console";
import { AppShell } from "@/components/app-shell";

export default function AdminRefundsPage() {
  return (
    <AppShell section="admin" eyebrow="Riaccrediti" title="Riaccrediti Wallet">
      <AdminRefundsConsole />
    </AppShell>
  );
}
