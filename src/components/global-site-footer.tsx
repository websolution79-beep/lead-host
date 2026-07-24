"use client";

import { usePathname } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";

export function GlobalSiteFooter() {
  const pathname = usePathname();
  const isProtectedArea =
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/");

  return isProtectedArea ? null : <SiteFooter />;
}
