import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { TeamMemberEarnings } from "@/components/team-member-earnings";
import { getServerSessionProfile } from "@/lib/auth/server-session";

export default async function TeamMemberEarningsPage() {
  const session = await getServerSessionProfile();

  if (!session) {
    redirect("/login?redirect=/admin/i-miei-guadagni");
  }

  if (session.isSuperAdmin || !session.teamAccess) {
    redirect(session.isSuperAdmin ? "/admin/team" : "/login?error=team_access");
  }

  return (
    <AppShell section="admin" eyebrow="Compensi" title="I miei guadagni">
      <TeamMemberEarnings />
    </AppShell>
  );
}
