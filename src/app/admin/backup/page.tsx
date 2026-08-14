import { AppShell } from "@/components/app-shell";
import { AdminBackupConsole } from "@/components/admin-backup-console";

export default function AdminBackupPage() {
  return (
    <AppShell section="admin" eyebrow="Dati e controllo" title="Backup">
      <AdminBackupConsole />
    </AppShell>
  );
}

