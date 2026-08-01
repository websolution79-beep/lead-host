import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { MarketingRevenueTemplateSettings } from "@/components/marketing-revenue-template-settings";

export default function MarketingRevenueEstimatePage() {
  return (
    <AppShell section="pm" eyebrow="Marketing / Rendita stimata" title="Rendita Stimata">
      <div className="mb-6 flex min-w-0 max-w-full gap-2 overflow-x-auto border-b border-slate-200 pb-3">
        <Link className="shrink-0 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-ink" href="/app/marketing/crm">CRM</Link>
        <Link className="shrink-0 rounded-lg bg-green px-4 py-2.5 text-sm font-bold text-white" href="/app/marketing/rendita-stimata">Rendita Stimata</Link>
      </div>
      <MarketingRevenueTemplateSettings />
    </AppShell>
  );
}
