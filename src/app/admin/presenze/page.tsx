import { AppShell } from "@/components/app-shell";
import { AdminTeamCalendar } from "@/components/admin-team-calendar";
import { redirect } from "next/navigation";
import { getServerSessionProfile } from "@/lib/auth/server-session";
import { getFirstAllowedAdminRoute } from "@/lib/admin/permissions";

export default async function TeamCalendarPage() {
  const session = await getServerSessionProfile();
  if (!session) redirect("/login?redirect=/admin/presenze");
  if (!session.isSuperAdmin) redirect(getFirstAllowedAdminRoute(session.teamAccess?.permissions ?? {}));
  return <AppShell section="admin" eyebrow="Team" title="Presenze e assenze"><AdminTeamCalendar /></AppShell>;
}
