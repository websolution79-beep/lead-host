import { AppShell } from "@/components/app-shell";
import { AdminCouponsConsole } from "@/components/admin-coupons-console";

export default function AdminCouponsPage() {
  return (
    <AppShell section="admin" eyebrow="Finanza" title="Coupon wallet">
      <AdminCouponsConsole />
    </AppShell>
  );
}
