import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AdminTeamConsole } from "@/components/admin-team-console";
import { getServerSessionProfile } from "@/lib/auth/server-session";

export default async function AdminTeamPage() {
  const session = await getServerSessionProfile();

  if (!session?.isSuperAdmin) {
    redirect(session ? "/admin" : "/login?redirect=/admin/team");
  }

  return (
    <AppShell section="admin" eyebrow="Configurazione" title="Team e permessi">
      <AdminTeamConsole />
    </AppShell>
  );
}
