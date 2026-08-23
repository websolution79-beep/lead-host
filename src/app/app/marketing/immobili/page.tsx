import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { MarketingManagedProperties } from "@/components/marketing-managed-properties";

export default function MarketingManagedPropertiesPage() {
  return <AppShell section="pm" eyebrow="Marketing / Gestione immobili" title="Gestione Immobili">
    <div className="mb-6 flex min-w-0 max-w-full gap-2 overflow-x-auto border-b border-slate-200 pb-3">
      <Link className="shrink-0 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-ink" href="/app/marketing/crm">CRM</Link>
      <Link className="shrink-0 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-ink" href="/app/marketing/rendita-stimata">Rendita Stimata</Link>
      <Link className="shrink-0 rounded-lg bg-green px-4 py-2.5 text-sm font-bold text-white" href="/app/marketing/immobili">Gestione Immobili</Link>
    </div>
    <MarketingManagedProperties />
  </AppShell>;
}
