import { AppShell } from "@/components/app-shell";
import { MarketingRevenueReport } from "@/components/marketing-revenue-report";

export default async function MarketingRevenueReportPage({
  params,
}: {
  params: Promise<{ estimateId: string }>;
}) {
  const { estimateId } = await params;
  return (
    <AppShell
      section="pm"
      eyebrow="Marketing / Rendita stimata"
      title="Anteprima relazione"
    >
      <MarketingRevenueReport estimateId={estimateId} />
    </AppShell>
  );
}
