import { AppShell } from "@/components/app-shell";
import { AdminAnalyticsConsole } from "@/components/admin-analytics-console";

export default function AdminAnalyticsPage() {
  return (
    <AppShell section="admin" eyebrow="Analytics" title="Analytics">
      <AdminAnalyticsConsole />
    </AppShell>
  );
}
