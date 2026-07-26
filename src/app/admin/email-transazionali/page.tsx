import { AppShell } from "@/components/app-shell";
import { AdminEmailConsole } from "@/components/admin-email-console";

export default function AdminEmailTemplatesPage() {
  return (
    <AppShell
      section="admin"
      eyebrow="Email"
      title="Email"
    >
      <AdminEmailConsole />
    </AppShell>
  );
}
