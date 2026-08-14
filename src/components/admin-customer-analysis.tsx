"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeEuro,
  CalendarDays,
  Download,
  Eye,
  Medal,
  RefreshCw,
  Search,
  ShoppingBag,
  UserRoundCheck,
  WalletCards,
} from "lucide-react";
import { PaginationControls, type PaginationState } from "@/components/pagination-controls";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { formatCurrencyCents } from "@/lib/auth/roles";

type CustomerRecord = {
  profileId: string;
  email: string;
  phone: string | null;
  displayName: string;
  primaryCity: string;
  accountStatus: string;
  marketingConsent: "granted" | "not_granted" | "withdrawn";
  walletBalanceCents: number;
  currency: string;
  purchasesCount: number;
  sharedPurchasesCount: number;
  exclusivePurchasesCount: number;
  refundedPurchasesCount: number;
  grossSpentCents: number;
  refundCents: number;
  netSpentCents: number;
  averagePurchaseCents: number;
  firstPurchaseAt: string | null;
  lastPurchaseAt: string | null;
  topUpsCount: number;
  topUpCents: number;
  firstTopUpAt: string | null;
  lastTopUpAt: string | null;
  rank: number;
};

type AnalysisPayload = {
  records: CustomerRecord[];
  topCustomers: CustomerRecord[];
  summary: {
    customers: number;
    purchases: number;
    grossSpentCents: number;
    refundsCents: number;
    netSpentCents: number;
    topUpCents: number;
    averageCustomerValueCents: number;
  };
  pagination: PaginationState;
  error?: string;
};

type Period = "all" | "30d" | "90d" | "custom";

export function AdminCustomerAnalysis({
  onOpenDetail,
}: {
  onOpenDetail: (profileId: string) => void;
}) {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [payload, setPayload] = useState<AnalysisPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState<Period>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [mode, setMode] = useState("all");
  const [consent, setConsent] = useState("all");
  const [status, setStatus] = useState("all");
  const [minPurchases, setMinPurchases] = useState("0");
  const [inactiveDays, setInactiveDays] = useState("0");
  const [buyersOnly, setBuyersOnly] = useState(true);
  const [sort, setSort] = useState("net_spend_desc");

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);

  const buildParams = useCallback(
    (targetPage: number, exportAll = false) => {
      const params = new URLSearchParams({
        page: String(targetPage),
        pageSize: "25",
        mode,
        consent,
        status,
        minPurchases,
        inactiveDays,
        buyersOnly: String(buyersOnly),
        sort,
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const range = resolvePeriod(period, dateFrom, dateTo);
      if (range.from) params.set("dateFrom", range.from);
      if (range.to) params.set("dateTo", range.to);
      if (exportAll) params.set("export", "1");
      return params;
    },
    [
      buyersOnly,
      consent,
      dateFrom,
      dateTo,
      debouncedSearch,
      inactiveDays,
      minPurchases,
      mode,
      period,
      sort,
      status,
    ],
  );

  const loadAnalysis = useCallback(
    async (targetPage = page) => {
      setLoading(true);
      setError("");
      const token = await getToken();
      if (!token) {
        setError("Sessione admin non trovata.");
        setLoading(false);
        return;
      }

      const response = await fetch(
        `/api/admin/property-managers/analysis?${buildParams(targetPage)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );
      const result = (await response.json()) as AnalysisPayload;
      if (!response.ok) {
        setError(result.error ?? "Non riesco a caricare l'analisi clienti.");
        setLoading(false);
        return;
      }
      setPayload(result);
      setPage(result.pagination.page);
      setLoading(false);
    },
    [buildParams, getToken, page],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAnalysis(page), 0);
    return () => window.clearTimeout(timer);
  }, [loadAnalysis, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setDebouncedSearch(search.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  async function exportCsv() {
    setExporting(true);
    setError("");
    const token = await getToken();
    if (!token) {
      setError("Sessione admin non trovata.");
      setExporting(false);
      return;
    }
    const response = await fetch(
      `/api/admin/property-managers/analysis?${buildParams(1, true)}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );
    const result = (await response.json()) as AnalysisPayload;
    if (!response.ok) {
      setError(result.error ?? "Esportazione non riuscita.");
      setExporting(false);
      return;
    }

    const headers = [
      "Posizione",
      "Property Manager",
      "Email",
      "Telefono",
      "Citta",
      "Acquisti",
      "Condivisi",
      "Esclusivi",
      "Spesa lorda",
      "Riaccrediti",
      "Spesa netta",
      "Acquisto medio",
      "Prima acquisto",
      "Ultimo acquisto",
      "Totale ricaricato",
      "Saldo wallet",
      "Consenso marketing",
      "Stato account",
    ];
    const rows = result.records.map((record) => [
      record.rank,
      record.displayName,
      record.email,
      record.phone ?? "",
      record.primaryCity,
      record.purchasesCount,
      record.sharedPurchasesCount,
      record.exclusivePurchasesCount,
      centsForCsv(record.grossSpentCents),
      centsForCsv(record.refundCents),
      centsForCsv(record.netSpentCents),
      centsForCsv(record.averagePurchaseCents),
      formatDate(record.firstPurchaseAt),
      formatDate(record.lastPurchaseAt),
      centsForCsv(record.topUpCents),
      centsForCsv(record.walletBalanceCents),
      consentLabel(record.marketingConsent),
      record.accountStatus === "active" ? "Attivo" : "Sospeso",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(csvCell).join(";"))
      .join("\r\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `lead-host-analisi-clienti-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  const summary = payload?.summary;

  return (
    <div className="grid gap-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={UserRoundCheck} label="PM acquirenti" value={String(summary?.customers ?? 0)} />
        <SummaryCard icon={ShoppingBag} label="Lead acquistati" value={String(summary?.purchases ?? 0)} />
        <SummaryCard icon={BadgeEuro} label="Spesa netta Lead" value={formatCurrencyCents(summary?.netSpentCents ?? 0, "eur")} />
        <SummaryCard icon={WalletCards} label="Valore medio cliente" value={formatCurrencyCents(summary?.averageCustomerValueCents ?? 0, "eur")} />
      </section>

      <section className="card p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="section-kicker">Periodo di analisi</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {([
                ["all", "Sempre"],
                ["30d", "Ultimi 30 giorni"],
                ["90d", "Ultimi 90 giorni"],
                ["custom", "Personalizzato"],
              ] as Array<[Period, string]>).map(([value, label]) => (
                <button key={value} type="button" onClick={() => { setPeriod(value); setPage(1); }} className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${period === value ? "bg-green text-white" : "bg-slate-100 text-slate-700"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={() => void loadAnalysis(page)} disabled={loading} className="btn btn-secondary min-h-11">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Aggiorna
            </button>
            <button type="button" onClick={() => void exportCsv()} disabled={exporting || loading} className="btn btn-secondary min-h-11">
              <Download size={16} /> {exporting ? "Esporto..." : "Esporta CSV"}
            </button>
          </div>
        </div>
        {period === "custom" ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:max-w-xl">
            <DateField label="Dal" value={dateFrom} onChange={(value) => { setDateFrom(value); setPage(1); }} />
            <DateField label="Al" value={dateTo} onChange={(value) => { setDateTo(value); setPage(1); }} />
          </div>
        ) : null}
      </section>

      <section className="card p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="relative block md:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input className="min-h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, email, telefono o città" />
          </label>
          <SelectField label="Modalità" value={mode} onChange={(value) => { setMode(value); setPage(1); }} options={[["all", "Tutte"], ["exclusive", "Esclusivi"], ["shared", "Condivisi"]]} />
          <SelectField label="Consenso marketing" value={consent} onChange={(value) => { setConsent(value); setPage(1); }} options={[["all", "Tutti"], ["granted", "Con consenso"], ["not_granted", "Senza consenso"], ["withdrawn", "Revocato"]]} />
          <SelectField label="Stato account" value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={[["all", "Tutti"], ["active", "Attivi"], ["suspended", "Sospesi"]]} />
          <SelectField label="Minimo acquisti" value={minPurchases} onChange={(value) => { setMinPurchases(value); setPage(1); }} options={[["0", "Nessun minimo"], ["2", "Almeno 2"], ["3", "Almeno 3"], ["5", "Almeno 5"], ["10", "Almeno 10"]]} />
          <SelectField label="Inattivi" value={inactiveDays} onChange={(value) => { setInactiveDays(value); setPage(1); }} options={[["0", "Qualsiasi attività"], ["30", "Da almeno 30 giorni"], ["60", "Da almeno 60 giorni"], ["90", "Da almeno 90 giorni"]]} />
          <SelectField label="Ordina per" value={sort} onChange={(value) => { setSort(value); setPage(1); }} options={[["net_spend_desc", "Spesa netta"], ["purchases_desc", "Numero acquisti"], ["last_purchase_desc", "Ultimo acquisto"], ["topups_desc", "Totale ricaricato"]]} />
          <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={buyersOnly} onChange={(event) => { setBuyersOnly(event.target.checked); setPage(1); }} />
            Solo PM con acquisti
          </label>
        </div>
      </section>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p> : null}

      {payload?.topCustomers.length ? (
        <section className="card p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <Medal className="text-amber-500" size={22} />
            <div>
              <p className="section-kicker">Classifica</p>
              <h2 className="mt-1 text-xl font-semibold text-ink">Migliori clienti per spesa netta</h2>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {payload.topCustomers.map((record) => (
              <button key={record.profileId} type="button" onClick={() => onOpenDetail(record.profileId)} className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-green/40 hover:bg-emerald-50">
                <span className="text-xs font-bold uppercase text-amber-600">#{record.rank}</span>
                <p className="mt-2 truncate font-semibold text-ink">{record.displayName}</p>
                <p className="mt-1 text-sm font-bold text-green">{formatCurrencyCents(record.netSpentCents, record.currency)}</p>
                <p className="mt-1 text-xs text-slate-500">{record.purchasesCount} acquisti</p>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <p className="section-kicker">Portafoglio clienti</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">Risultati analisi</h2>
          <p className="mt-2 text-sm text-slate-600">Spesa netta = acquisti Lead meno riaccrediti Wallet.</p>
        </div>
        <div className="grid gap-3 p-4 md:hidden">
          {loading ? <LoadingState /> : payload?.records.length ? payload.records.map((record) => <CustomerMobileCard key={record.profileId} record={record} onOpen={() => onOpenDetail(record.profileId)} />) : <EmptyState />}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-[1180px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
              <tr><th className="px-4 py-4">#</th><th className="px-4 py-4">Property Manager</th><th className="px-4 py-4">Acquisti</th><th className="px-4 py-4">Spesa lorda</th><th className="px-4 py-4">Riaccrediti</th><th className="px-4 py-4">Spesa netta</th><th className="px-4 py-4">Ultimo acquisto</th><th className="px-4 py-4">Marketing</th><th className="px-4 py-4">Azioni</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={9} className="p-8 text-center text-slate-500">Carico analisi clienti...</td></tr> : payload?.records.length ? payload.records.map((record) => (
                <tr key={record.profileId} className="align-top hover:bg-slate-50">
                  <td className="px-4 py-4 font-bold text-amber-600">#{record.rank}</td>
                  <td className="px-4 py-4"><p className="font-semibold text-ink">{record.displayName}</p><p className="mt-1 text-slate-500">{record.email}</p><p className="mt-1 text-xs text-slate-500">{record.primaryCity}</p></td>
                  <td className="px-4 py-4"><p className="font-semibold text-ink">{record.purchasesCount}</p><p className="mt-1 text-xs text-slate-500">{record.sharedPurchasesCount} condivisi · {record.exclusivePurchasesCount} esclusivi</p></td>
                  <td className="px-4 py-4 font-semibold">{formatCurrencyCents(record.grossSpentCents, record.currency)}</td>
                  <td className="px-4 py-4 text-amber-700">{formatCurrencyCents(record.refundCents, record.currency)}</td>
                  <td className="px-4 py-4 font-bold text-green">{formatCurrencyCents(record.netSpentCents, record.currency)}</td>
                  <td className="px-4 py-4 text-slate-600">{formatDate(record.lastPurchaseAt)}</td>
                  <td className="px-4 py-4"><ConsentBadge status={record.marketingConsent} /></td>
                  <td className="px-4 py-4"><button type="button" onClick={() => onOpenDetail(record.profileId)} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold"><Eye size={14} /> Dettaglio</button></td>
                </tr>
              )) : <tr><td colSpan={9}><EmptyState /></td></tr>}
            </tbody>
          </table>
        </div>
        {payload ? <PaginationControls pagination={payload.pagination} disabled={loading} onPageChange={setPage} /> : null}
      </section>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value }: { icon: typeof BadgeEuro; label: string; value: string }) {
  return <article className="card p-5"><span className="flex size-9 items-center justify-center rounded-lg bg-emerald-50 text-green"><Icon size={18} /></span><p className="mt-4 text-sm font-semibold text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-ink">{value}</p></article>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return <label className="block"><span className="mb-1 block text-xs font-bold uppercase text-slate-500">{label}</span><select className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold" value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="mb-1 flex items-center gap-2 text-xs font-bold uppercase text-slate-500"><CalendarDays size={14} /> {label}</span><input type="date" className="min-h-11 w-full rounded-lg border border-slate-200 px-3" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function CustomerMobileCard({ record, onOpen }: { record: CustomerRecord; onOpen: () => void }) {
  return <article className="rounded-lg border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className="text-xs font-bold text-amber-600">#{record.rank}</span><p className="mt-1 font-semibold text-ink">{record.displayName}</p><p className="mt-1 break-all text-sm text-slate-500">{record.email}</p></div><ConsentBadge status={record.marketingConsent} /></div><div className="mt-4 grid grid-cols-2 gap-3"><MobileMetric label="Acquisti" value={String(record.purchasesCount)} /><MobileMetric label="Spesa netta" value={formatCurrencyCents(record.netSpentCents, record.currency)} /><MobileMetric label="Riaccrediti" value={formatCurrencyCents(record.refundCents, record.currency)} /><MobileMetric label="Ultimo acquisto" value={formatDate(record.lastPurchaseAt)} /></div><button type="button" onClick={onOpen} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 text-sm font-semibold"><Eye size={15} /> Dettaglio PM</button></article>;
}

function MobileMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold text-ink">{value}</p></div>; }
function ConsentBadge({ status }: { status: CustomerRecord["marketingConsent"] }) { return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${status === "granted" ? "bg-emerald-100 text-emerald-800" : status === "withdrawn" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>{consentLabel(status)}</span>; }
function LoadingState() { return <p className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500">Carico analisi clienti...</p>; }
function EmptyState() { return <p className="p-8 text-center text-sm text-slate-500">Nessun cliente corrisponde ai filtri selezionati.</p>; }
function consentLabel(status: CustomerRecord["marketingConsent"]) { return status === "granted" ? "Consenso attivo" : status === "withdrawn" ? "Revocato" : "Non presente"; }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(new Date(value)) : "Mai"; }
function centsForCsv(value: number) { return (value / 100).toFixed(2).replace(".", ","); }
function csvCell(value: string | number) { return `"${String(value).replaceAll('"', '""')}"`; }
function resolvePeriod(period: Period, from: string, to: string) { if (period === "custom") return { from, to }; if (period === "all") return { from: "", to: "" }; const days = period === "30d" ? 30 : 90; const date = new Date(); date.setUTCDate(date.getUTCDate() - days); return { from: date.toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) }; }

