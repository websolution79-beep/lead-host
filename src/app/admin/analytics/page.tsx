import { AppShell } from "@/components/app-shell";
import { WorkspacePlaceholder } from "@/components/workspace-placeholder";

export default function AdminAnalyticsPage() {
  return (
    <AppShell section="admin" eyebrow="Analytics" title="Analytics">
      <WorkspacePlaceholder
        title="Attribuzione economica"
        description="Lead acquisiti, pubblicati, venduti, ricavi e performance per fonte/campagna."
        items={["CPL", "Tasso vendita", "Ricavo medio lead", "ROAS futuro", "ROI futuro"]}
      />
    </AppShell>
  );
}
