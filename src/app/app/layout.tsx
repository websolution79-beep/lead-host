import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppAreaChrome } from "@/components/app-area-chrome";
import { AppSessionProvider } from "@/components/app-session-provider";
import {
  getFirstAllowedAdminRoute,
  hasAdminPermission,
} from "@/lib/admin/permissions";
import { hasRole } from "@/lib/auth/roles";
import { getServerSessionProfile } from "@/lib/auth/server-session";
import { privatePageRobots } from "@/lib/seo/robots";
import { getMarketingAddonState } from "@/lib/addons/access";

type AppAreaLayoutProps = {
  children: ReactNode;
};

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: privatePageRobots,
};

export default async function AppAreaLayout({ children }: AppAreaLayoutProps) {
  const session = await getServerSessionProfile();

  if (!session) {
    redirect("/login?redirect=/app/marketplace");
  }

  const isTeamMarketplaceReader =
    !session.isSuperAdmin &&
    hasRole(session.roles, "team_member") &&
    hasAdminPermission(session.teamAccess?.permissions ?? {}, "marketplace");

  if (!hasRole(session.roles, "property_manager") && !isTeamMarketplaceReader) {
    if (session.teamAccess?.mustChangePassword) {
      redirect("/reimposta-password?forced=1");
    }

    if (session.isSuperAdmin) {
      redirect("/admin");
    }

    if (session.teamAccess?.status === "active") {
      redirect(getFirstAllowedAdminRoute(session.teamAccess.permissions));
    }

    redirect("/login?error=role");
  }

  const marketingAddon =
    session.isSuperAdmin || hasRole(session.roles, "property_manager")
      ? await getMarketingAddonState(session.profile.id, session.isSuperAdmin)
      : null;

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
        adminPermissions: session.teamAccess?.permissions,
        marketingAddon: marketingAddon
          ? {
              menuVisible: marketingAddon.menuVisible,
              hasAccess: marketingAddon.hasAccess,
            }
          : undefined,
      }}
    >
      <AppAreaChrome
        section="pm"
        marketingAddon={marketingAddon ?? undefined}
      >
        {children}
      </AppAreaChrome>
    </AppSessionProvider>
  );
}
