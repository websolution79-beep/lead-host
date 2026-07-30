import { cookies } from "next/headers";
import { cache } from "react";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/session-cookies";
import { getTeamAccessForProfile } from "@/lib/admin/team-access";
import { getAuthenticatedProfileContext } from "@/lib/auth/profile-context";

export const getServerSessionProfile = cache(async function getServerSessionProfile() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    return null;
  }

  const context = await getAuthenticatedProfileContext(accessToken);

  if (!context || context.profile.status !== "active") {
    return null;
  }

  const isSuperAdmin = context.roles.includes("super_admin");
  const teamAccess =
    !isSuperAdmin && context.roles.includes("team_member")
      ? await getTeamAccessForProfile(context.profile.id)
      : null;

  return {
    user: { id: context.userId },
    profile: context.profile,
    roles: context.roles,
    isSuperAdmin,
    teamAccess,
  };
});
