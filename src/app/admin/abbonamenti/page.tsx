import { AppShell } from "@/components/app-shell";
import { AdminSubscriptionsConsole } from "@/components/admin-subscriptions-console";

export default function AdminSubscriptionsPage() {
  return <AppShell section="admin" eyebrow="Finanza" title="Abbonamenti"><AdminSubscriptionsConsole /></AppShell>;
}
