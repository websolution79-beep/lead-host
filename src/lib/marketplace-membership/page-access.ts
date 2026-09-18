import { redirect } from "next/navigation";
import { getServerSessionProfile } from "@/lib/auth/server-session";
import { hasAdminPermission } from "@/lib/admin/permissions";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { getMarketplaceAccess } from "./access";

export async function getMarketplacePageAccess() {
  const session = await getServerSessionProfile();
  if (!session) redirect("/login");
  const staff = session.isSuperAdmin || (session.roles.includes("team_member") &&
    hasAdminPermission(session.teamAccess?.permissions ?? {}, "marketplace"));
  if (staff) return { session, access: "staff" as const };
  if (!session.roles.includes("property_manager")) redirect("/admin");
  const access = await getMarketplaceAccess(createServiceSupabaseClient(), session.profile.id);
  return { session, access };
}

export async function requireMarketplacePageAccess() {
  const context = await getMarketplacePageAccess();
  if (context.access === "required") redirect("/app/marketplace");
  return context;
}
