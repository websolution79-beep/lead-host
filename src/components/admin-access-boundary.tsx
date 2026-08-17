"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { useAppSession } from "@/components/app-session-provider";
import {
  getAdminPagePermission,
  getFirstAllowedAdminRoute,
  hasAdminPermission,
} from "@/lib/admin/permissions";

export function AdminAccessBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useAppSession();
  const permissions = session.adminPermissions ?? {};
  const pagePermission = getAdminPagePermission(pathname);
  const isProfilePage = pathname.startsWith("/admin/profilo");
  const isTeamPage = pathname.startsWith("/admin/team");
  const isEarningsPage = pathname.startsWith("/admin/i-miei-guadagni");
  const canAccess =
    session.isSuperAdmin ||
    isProfilePage ||
    isEarningsPage ||
    (!isTeamPage &&
      Boolean(pagePermission) &&
      hasAdminPermission(permissions, pagePermission!));
  const destination = getFirstAllowedAdminRoute(permissions);

  useEffect(() => {
    if (!canAccess) {
      router.replace(destination);
    }
  }, [canAccess, destination, router]);

  if (!canAccess) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="card p-6 text-sm font-semibold text-muted">
          Reindirizzamento alla prima sezione disponibile...
        </div>
      </div>
    );
  }

  const accessLevel = pagePermission ? permissions[pagePermission] : undefined;

  return (
    <>
      {!session.isSuperAdmin && accessLevel === "read" ? (
        <div className="border-b border-blue-200 bg-blue-50">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-5 py-3 text-sm font-semibold text-blue-800 sm:px-8">
            <Eye size={17} />
            Modalità sola lettura: puoi consultare i dati, ma non modificarli.
          </div>
        </div>
      ) : null}
      {children}
    </>
  );
}
