import type { ReactNode } from "react";
import { redirect } from "next/navigation";
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

  return children;
}
