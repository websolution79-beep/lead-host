import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { MarketingCrmBoard } from "@/components/marketing-crm-board";

export default function MarketingCrmPage() {
  return (
    <AppShell section="pm" eyebrow="Marketing / CRM" title="CRM proprietari">
      <div className="mb-6 flex min-w-0 max-w-full gap-2 overflow-x-auto border-b border-slate-200 pb-3">
        <Link className="shrink-0 rounded-lg bg-green px-4 py-2.5 text-sm font-bold text-white" href="/app/marketing/crm">CRM</Link>
        <Link className="shrink-0 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-400" href="/app/marketing">Rendita Stimata · in arrivo</Link>
      </div>
      <MarketingCrmBoard />
    </AppShell>
  );
}
