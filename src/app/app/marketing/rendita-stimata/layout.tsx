import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getMarketingAddonState } from "@/lib/addons/access";
import { getServerSessionProfile } from "@/lib/auth/server-session";

export default async function MarketingRevenueLayout({ children }: { children: ReactNode }) {
  const session = await getServerSessionProfile();
  if (!session) redirect("/login?redirect=/app/marketing/rendita-stimata");

  const addon = await getMarketingAddonState(
    session.profile.id,
    session.isSuperAdmin,
  );
  if (!addon.hasAccess) redirect("/app/marketing");

  return children;
}
