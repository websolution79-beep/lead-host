import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { TeamMemberEarnings } from "@/components/team-member-earnings";
import { getServerSessionProfile } from "@/lib/auth/server-session";

export default async function TeamMemberEarningsPage({
  searchParams,
}: {
  searchParams: Promise<{ previewMemberId?: string }>;
}) {
  const session = await getServerSessionProfile();
  const { previewMemberId } = await searchParams;

  if (!session) {
    redirect("/login?redirect=/admin/i-miei-guadagni");
  }

  if (session.isSuperAdmin && !previewMemberId) {
    redirect("/admin/team");
  }

  if (!session.isSuperAdmin && !session.teamAccess) {
    redirect(session.isSuperAdmin ? "/admin/team" : "/login?error=team_access");
  }

  return (
    <AppShell section="admin" eyebrow="Compensi" title={session.isSuperAdmin ? "Anteprima guadagni collaboratore" : "I miei guadagni"}>
      <TeamMemberEarnings previewMemberId={session.isSuperAdmin ? previewMemberId : undefined} />
    </AppShell>
  );
}
