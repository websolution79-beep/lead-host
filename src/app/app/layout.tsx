import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerSessionUser } from "@/lib/auth/server-session";

type AppAreaLayoutProps = {
  children: ReactNode;
};

export const dynamic = "force-dynamic";

export default async function AppAreaLayout({ children }: AppAreaLayoutProps) {
  const user = await getServerSessionUser();

  if (!user) {
    redirect("/login?redirect=/app/marketplace");
  }

  return children;
}
