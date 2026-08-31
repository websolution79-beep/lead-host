import { AppShell } from "@/components/app-shell";
import { AdminCommercialSettings } from "@/components/admin-commercial-settings";
import { AdminWhatsAppWidgetSettings } from "@/components/admin-whatsapp-widget-settings";

export default function AdminSettingsPage() {
  return (
    <AppShell section="admin" eyebrow="Impostazioni" title="Impostazioni">
      <AdminCommercialSettings />
      <AdminWhatsAppWidgetSettings />
    </AppShell>
  );
}
