import { AppShell } from "@/components/app-shell";
import { AdminBrevoConsole } from "@/components/admin-brevo-console";

export default function AdminBrevoPage() {
  return (
    <AppShell section="admin" eyebrow="Marketing automation" title="Brevo">
      <AdminBrevoConsole />
    </AppShell>
  );
}
