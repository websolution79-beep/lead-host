import { AppShell } from "@/components/app-shell";
import { NotificationsCenter } from "@/components/notifications-center";

export default function NotificationsPage() {
  return (
    <AppShell section="pm" eyebrow="Notifiche" title="Notifiche">
      <NotificationsCenter />
    </AppShell>
  );
}
