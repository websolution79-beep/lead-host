import { AppShell } from "@/components/app-shell";
import { AdminEmailTemplatesConsole } from "@/components/admin-email-templates-console";

export default function AdminEmailTemplatesPage() {
  return (
    <AppShell
      section="admin"
      eyebrow="Email"
      title="Email transazionali"
    >
      <AdminEmailTemplatesConsole />
    </AppShell>
  );
}
