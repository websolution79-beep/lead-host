import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppAreaChrome } from "@/components/app-area-chrome";
import { AppSessionProvider } from "@/components/app-session-provider";
import { hasRole } from "@/lib/auth/roles";
import { getServerSessionProfile } from "@/lib/auth/server-session";

type AdminAreaLayoutProps = {
  children: ReactNode;
};

export const dynamic = "force-dynamic";

export default async function AdminAreaLayout({ children }: AdminAreaLayoutProps) {
  const session = await getServerSessionProfile();

  if (!session) {
    redirect("/login?redirect=/admin");
  }

  if (!hasRole(session.roles, "super_admin")) {
    redirect("/app/marketplace");
  }

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
      }}
    >
      <AppAreaChrome section="admin">{children}</AppAreaChrome>
    </AppSessionProvider>
  );
}
