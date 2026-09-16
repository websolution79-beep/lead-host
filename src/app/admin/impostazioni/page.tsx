import { AppShell } from "@/components/app-shell";
import { AdminCommercialSettings } from "@/components/admin-commercial-settings";
import { AdminWhatsAppWidgetSettings } from "@/components/admin-whatsapp-widget-settings";
import Link from "next/link";
import { Store } from "lucide-react";

export default function AdminSettingsPage() {
  return (
    <AppShell section="admin" eyebrow="Impostazioni" title="Impostazioni">
      <Link href="/admin/impostazioni/marketplace" className="btn btn-secondary mb-6 w-fit">
        <Store size={18} /> Impostazioni Marketplace
      </Link>
      <AdminCommercialSettings />
      <AdminWhatsAppWidgetSettings />
    </AppShell>
  );
}
