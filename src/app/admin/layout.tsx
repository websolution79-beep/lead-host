import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppAreaChrome } from "@/components/app-area-chrome";
import { AppSessionProvider } from "@/components/app-session-provider";
import { getFirstAllowedAdminRoute } from "@/lib/admin/permissions";
import { hasRole } from "@/lib/auth/roles";
import { getServerSessionProfile } from "@/lib/auth/server-session";
import { privatePageRobots } from "@/lib/seo/robots";
import { PrimeLifecycleHeartbeat } from "@/components/prime-lifecycle-heartbeat";

type AdminAreaLayoutProps = {
  children: ReactNode;
};

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: privatePageRobots,
};

export default async function AdminAreaLayout({ children }: AdminAreaLayoutProps) {
  const session = await getServerSessionProfile();

  if (!session) {
    redirect("/login?redirect=/admin");
  }

  const isTeamMember = hasRole(session.roles, "team_member");

  if (!session.isSuperAdmin && !isTeamMember) {
    redirect("/app/marketplace");
  }

  if (isTeamMember && !session.teamAccess) {
    redirect("/login?error=team_access");
  }

  if (session.teamAccess?.status === "suspended") {
    redirect("/login?error=team_suspended");
  }

  if (session.teamAccess?.mustChangePassword) {
    redirect("/reimposta-password?forced=1");
  }

  const adminPermissions = session.teamAccess?.permissions ?? {};
  const adminHomeHref = session.isSuperAdmin
    ? "/admin"
    : getFirstAllowedAdminRoute(adminPermissions);

  return (
    <AppSessionProvider
      session={{
        userId: session.user.id,
        profileId: session.profile.id,
        email: session.profile.email,
        firstName: session.profile.first_name,
        lastName: session.profile.last_name,
        avatarUrl: session.profile.avatar_url,
        roles: session.roles,
        isSuperAdmin: session.isSuperAdmin,
        adminPermissions,
      }}
    >
      <PrimeLifecycleHeartbeat />
      <AppAreaChrome
        section="admin"
        adminHomeHref={adminHomeHref}
        adminPermissions={adminPermissions}
        isSuperAdmin={session.isSuperAdmin}
      >
        {children}
      </AppAreaChrome>
    </AppSessionProvider>
  );
}
