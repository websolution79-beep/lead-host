import { AppShell } from "@/components/app-shell";
import { AdminCouponsConsole } from "@/components/admin-coupons-console";
import { hasAdminPermission } from "@/lib/admin/permissions";
import { getServerSessionProfile } from "@/lib/auth/server-session";

export default async function AdminCouponsPage() {
  const session = await getServerSessionProfile();
  const readOnly =
    !session?.isSuperAdmin &&
    !hasAdminPermission(session?.teamAccess?.permissions ?? {}, "coupons", "write");

  return (
    <AppShell section="admin" eyebrow="Finanza" title="Coupon wallet">
      <AdminCouponsConsole readOnly={readOnly} />
    </AppShell>
  );
}
