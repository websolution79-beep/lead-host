import { AppShell } from "@/components/app-shell";
import { AdminBillingConsole } from "@/components/admin-billing-console";

export default function AdminBillingPage() {
  return (
    <AppShell
      section="admin"
      eyebrow="Fatturazione elettronica"
      title="Fatturazione"
    >
      <AdminBillingConsole />
    </AppShell>
  );
}
