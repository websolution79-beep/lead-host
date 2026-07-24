import { AppShell } from "@/components/app-shell";
import { AdminTelegramConsole } from "@/components/admin-telegram-console";

export default function AdminTelegramPage() {
  return (
    <AppShell section="admin" eyebrow="Canale" title="Telegram">
      <AdminTelegramConsole />
    </AppShell>
  );
}
