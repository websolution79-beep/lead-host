import { AppShell } from "@/components/app-shell";
import { AdminTeamCalendar } from "@/components/admin-team-calendar";
import { redirect } from "next/navigation";
import { getServerSessionProfile } from "@/lib/auth/server-session";

export default async function TeamCalendarPage() {
  const session = await getServerSessionProfile();
  if (!session) redirect("/login?redirect=/admin/presenze");
  if (!session.isSuperAdmin && session.teamAccess?.status !== "active") redirect("/login?error=team_access");
  return <AppShell section="admin" eyebrow="Team" title="Presenze e assenze"><AdminTeamCalendar /></AppShell>;
}
