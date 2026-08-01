import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerSessionProfile } from "@/lib/auth/server-session";

export default async function MarketingPreviewLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSessionProfile();

  if (!session?.isSuperAdmin) {
    redirect("/app/marketplace");
  }

  return children;
}
