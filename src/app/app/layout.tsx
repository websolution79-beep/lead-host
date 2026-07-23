import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppAreaChrome } from "@/components/app-area-chrome";
import { AppSessionProvider } from "@/components/app-session-provider";
import { getServerSessionProfile } from "@/lib/auth/server-session";

type AppAreaLayoutProps = {
  children: ReactNode;
};

export const dynamic = "force-dynamic";

export default async function AppAreaLayout({ children }: AppAreaLayoutProps) {
  const session = await getServerSessionProfile();

  if (!session) {
    redirect("/login?redirect=/app/marketplace");
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
      <AppAreaChrome section="pm">{children}</AppAreaChrome>
    </AppSessionProvider>
  );
}
