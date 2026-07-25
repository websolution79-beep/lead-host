import { AppShell } from "@/components/app-shell";
import { AdminTrackingConsole } from "@/components/admin-tracking-console";

export default function AdminTrackingPage() {
  return (
    <AppShell section="admin" eyebrow="Misurazione" title="Tracking">
      <AdminTrackingConsole />
    </AppShell>
  );
}
