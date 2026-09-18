"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Crown, Eye, Filter, Map, RefreshCw, RotateCcw, Search, X } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { formatCurrencyCents } from "@/lib/auth/roles";
import { PaginationControls, type PaginationState } from "@/components/pagination-controls";

type Product = "all" | "lead-host-prime" | "marketing" | "marketplace";
type Status = "all" | "active" | "trialing" | "past_due" | "cancel_at_period_end" | "canceled";
type ProductSummary = { total: number; active: number; trialing: number; cancelAtPeriodEnd: number; pastDue: number };
type SubscriptionRow = {
  id: string;
  propertyManager: { name: string; email: string; city: string | null; accountStatus: string };
  product: { slug: Exclude<Product, "all">; name: string };
  status: { key: Exclude<Status, "all">; label: string; tone: "green" | "blue" | "amber" | "red" | "slate" };
  source: "stripe" | "manual";
  priceCents: number | null;
  currency: string;
  startedAt: string | null;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  nextDate: string | null;
  cancelAtPeriodEnd: boolean;
  accountManager: { name: string; email: string } | null;
};
type Detail = {
  propertyManager: { name: string; email: string; phone: string | null; city: string | null; accountStatus: string; registeredAt: string };
  product: { slug: string; name: string; currency: string; priceCents: number | null };
  subscription: { id: string; status: string; source: string; trialStartedAt: string | null; trialEndsAt: string | null; currentPeriodStartedAt: string | null; currentPeriodEndsAt: string | null; cancelAtPeriodEnd: boolean; canceledAt: string | null; accessExpiresAt: string | null; manualReason: string | null; createdAt: string };
  prime: { status: string; accessSource: string; accessEndsAt: string | null; graceEndsAt: string | null; accountManager: { name: string; email: string } | null } | null;
  summary: { totalPaidCents: number; paymentCount: number };
  payments: Array<{ id: string; kind: string; amountCents: number; currency: string; status: string; paidAt: string | null; periodStart: string | null; periodEnd: string | null; createdAt: string }>;
};
type Payload = {
  rows: SubscriptionRow[];
  stats: { prime: ProductSummary; marketing: ProductSummary; marketplace: ProductSummary };
  pagination: PaginationState;
  error?: string;
};

const emptyPagination: PaginationState = { page: 1, pageSize: 25, total: 0, totalPages: 1 };
const emptySummary: ProductSummary = { total: 0, active: 0, trialing: 0, cancelAtPeriodEnd: 0, pastDue: 0 };

export function AdminSubscriptionsConsole() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [stats, setStats] = useState<Payload["stats"]>({ prime: emptySummary, marketing: emptySummary, marketplace: emptySummary });
  const [pagination, setPagination] = useState(emptyPagination);
  const [product, setProduct] = useState<Product>("all");
  const [status, setStatus] = useState<Status>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const token = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);

  const load = useCallback(async (targetPage = page) => {
    setLoading(true);
    setError("");
    try {
      const accessToken = await token();
      if (!accessToken) throw new Error("Sessione admin non trovata.");
      const params = new URLSearchParams({ product, status, page: String(targetPage) });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const response = await fetch(`/api/admin/subscriptions?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store",
      });
      const payload = (await response.json()) as Payload;
      if (!response.ok) throw new Error(payload.error ?? "Abbonamenti non disponibili.");
      setRows(payload.rows ?? []);
      setStats(payload.stats);
      setPagination(payload.pagination ?? emptyPagination);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Abbonamenti non disponibili.");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, debouncedSearch, page, product, status, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(page); }, 0);
    return () => window.clearTimeout(timer);
  }, [load, page]);

  const reset = () => {
    setProduct("all"); setStatus("all"); setSearch(""); setDebouncedSearch(""); setDateFrom(""); setDateTo(""); setPage(1);
  };

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const accessToken = await token();
      if (!accessToken) throw new Error("Sessione admin non trovata.");
      const response = await fetch(`/api/admin/subscriptions/${id}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
      const payload = (await response.json()) as Detail & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Dettaglio non disponibile.");
      setDetail(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Dettaglio non disponibile.");
    } finally {
      setDetailLoading(false);
    }
  };

  return <div className="grid min-w-0 gap-6">
    <section className="grid gap-4 xl:grid-cols-3">
      <SubscriptionGroup title="Lead Host PRIME" icon={<Crown className="size-5 text-amber-600" />} tone="amber" summary={stats.prime} />
      <SubscriptionGroup title="Marketplace" icon={<Map className="size-5 text-sky-600" />} tone="sky" summary={stats.marketplace} marketplace />
      <SubscriptionGroup title="Modulo Marketing" icon={<CalendarClock className="size-5 text-emerald-600" />} tone="green" summary={stats.marketing} />
    </section>

    <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg border border-emerald-100 bg-emerald-50 text-green"><Filter size={19} /></span><div><p className="section-kicker">Archivio abbonamenti</p><h2 className="mt-1 text-xl font-semibold text-ink">Filtra gli abbonamenti</h2></div></div>
        <button type="button" className="icon-button" title="Aggiorna abbonamenti" aria-label="Aggiorna abbonamenti" disabled={loading} onClick={() => void load(page)}><RefreshCw className={loading ? "animate-spin" : undefined} size={17} /></button>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(11rem,0.72fr)_minmax(11rem,0.72fr)_auto] lg:items-end">
        <label className="grid gap-2 text-sm font-semibold text-ink"><span>Cerca Property Manager</span><span className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-slate-400" /><input className="input min-h-12 w-full bg-white pl-11 shadow-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, email, città o Account Manager" /></span></label>
        <label className="grid gap-2 text-sm font-semibold text-ink"><span>Abbonamento</span><select className="input min-h-12 bg-white shadow-sm" value={product} onChange={(event) => { setProduct(event.target.value as Product); setPage(1); }}><option value="all">Tutti gli abbonamenti</option><option value="lead-host-prime">Lead Host PRIME</option><option value="marketplace">Marketplace</option><option value="marketing">Modulo Marketing</option></select></label>
        <label className="grid gap-2 text-sm font-semibold text-ink"><span>Stato</span><select className="input min-h-12 bg-white shadow-sm" value={status} onChange={(event) => { setStatus(event.target.value as Status); setPage(1); }}><option value="all">Tutti gli stati</option><option value="active">Attivi</option><option value="trialing">In prova</option><option value="cancel_at_period_end">Rinnovi disattivati</option><option value="past_due">Pagamento da regolarizzare</option><option value="canceled">Scaduti o disdetti</option></select></label>
        <button type="button" className="btn btn-secondary min-h-12 px-4" onClick={reset}><RotateCcw size={16} /> Reset</button>
      </div>
      <div className="mt-5 border-t border-slate-200 pt-4"><div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><CalendarClock size={16} className="text-green" /> Prossima scadenza</div><div className="mt-3 grid gap-4 sm:max-w-2xl sm:grid-cols-2"><label className="grid gap-2 text-sm font-semibold text-ink"><span>Da</span><input className="input min-h-11 bg-white shadow-sm" type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} /></label><label className="grid gap-2 text-sm font-semibold text-ink"><span>Fino a</span><input className="input min-h-11 bg-white shadow-sm" type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} /></label></div></div>
    </section>

    {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="overflow-x-auto"><table className="min-w-[980px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-4">Property Manager</th><th className="px-4 py-4">Abbonamento</th><th className="px-4 py-4">Stato</th><th className="px-4 py-4">Prezzo</th><th className="px-4 py-4">Prossima scadenza</th><th className="px-4 py-4">Account Manager</th><th className="px-4 py-4 text-right">Azioni</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-100"><td className="px-4 py-4"><p className="font-semibold text-ink">{row.propertyManager.name}</p><p className="mt-1 text-xs text-muted">{row.propertyManager.email}{row.propertyManager.city ? ` · ${row.propertyManager.city}` : ""}</p></td><td className="px-4 py-4"><ProductBadge slug={row.product.slug} label={row.product.name} /></td><td className="px-4 py-4"><StatusBadge status={row.status} /></td><td className="px-4 py-4 font-semibold text-ink">{row.priceCents === null ? "Non disponibile" : `${formatCurrencyCents(row.priceCents)} / mese`}</td><td className="px-4 py-4 text-slate-700">{formatDate(row.nextDate)}</td><td className="px-4 py-4 text-slate-700">{row.accountManager?.name ?? "-"}</td><td className="px-4 py-4 text-right"><button className="btn btn-secondary min-h-10 px-3" type="button" disabled={detailLoading} onClick={() => void openDetail(row.id)}><Eye size={16} /> Dettaglio</button></td></tr>)}{!loading && !rows.length ? <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-muted">Nessun abbonamento corrisponde ai filtri selezionati.</td></tr> : null}</tbody></table></div>
      <PaginationControls pagination={pagination} disabled={loading} onPageChange={setPage} />
    </section>
    {detail ? <SubscriptionDetail detail={detail} onClose={() => setDetail(null)} /> : null}
  </div>;
}

function SubscriptionGroup({ title, icon, tone, summary, marketplace = false }: { title: string; icon: React.ReactNode; tone: "amber" | "sky" | "green"; summary: ProductSummary; marketplace?: boolean }) {
  const border = tone === "amber" ? "border-amber-200" : tone === "sky" ? "border-sky-200" : "border-emerald-200";
  return <section className={`rounded-lg border ${border} bg-white p-4`}><div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-lg bg-slate-50">{icon}</span><h2 className="font-semibold text-ink">{title}</h2></div><div className="mt-4 grid grid-cols-3 gap-2 text-center">{marketplace ? <Metric label="Paganti" value={summary.active} /> : <Metric label="Attivi" value={summary.active} />} {marketplace ? <Metric label="In prova" value={summary.trialing} /> : <Metric label="Totali" value={summary.total} />}<Metric label={marketplace ? "Totali" : "Rinnovi off"} value={marketplace ? summary.total : summary.cancelAtPeriodEnd} /></div>{marketplace ? <p className="mt-3 text-center text-xs font-medium text-slate-500">Rinnovi disattivati: {summary.cancelAtPeriodEnd}</p> : <p className="mt-3 text-center text-xs font-medium text-slate-500">Pagamenti critici: {summary.pastDue}</p>}</section>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-md bg-slate-50 px-2 py-3"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold text-ink">{value}</p></div>; }
function ProductBadge({ slug, label }: { slug: string; label: string }) { const style = slug === "lead-host-prime" ? "border-amber-200 bg-amber-50 text-amber-800" : slug === "marketplace" ? "border-sky-200 bg-sky-50 text-sky-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"; return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${style}`}>{label}</span>; }
function StatusBadge({ status }: { status: SubscriptionRow["status"] }) { const style = status.tone === "green" ? "bg-emerald-100 text-emerald-800" : status.tone === "blue" ? "bg-sky-100 text-sky-800" : status.tone === "amber" ? "bg-amber-100 text-amber-800" : status.tone === "red" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"; return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${style}`}>{status.label}</span>; }

function SubscriptionDetail({ detail, onClose }: { detail: Detail; onClose: () => void }) { return <div className="fixed inset-0 z-[120] overflow-y-auto bg-slate-950/50 p-0 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label="Dettaglio abbonamento"><section className="min-h-full w-full bg-white shadow-2xl sm:mx-auto sm:min-h-0 sm:max-w-4xl sm:rounded-xl"><header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-7"><div><p className="section-kicker">Dettaglio abbonamento</p><h2 className="mt-1 text-xl font-semibold text-ink">{detail.product.name}</h2><p className="mt-1 text-sm text-muted">{detail.propertyManager.name} · {detail.propertyManager.email}</p></div><button type="button" className="icon-button" title="Chiudi" aria-label="Chiudi" onClick={onClose}><X size={18} /></button></header><div className="grid gap-6 p-5 sm:p-7"><div className="grid gap-3 sm:grid-cols-3"><DetailMetric label="Prezzo concordato" value={detail.product.priceCents === null ? "Non disponibile" : `${formatCurrencyCents(detail.product.priceCents)} / mese`} /><DetailMetric label="Totale pagato" value={formatCurrencyCents(detail.summary.totalPaidCents)} /><DetailMetric label="Pagamenti riusciti" value={String(detail.summary.paymentCount)} /></div><section><h3 className="text-base font-semibold text-ink">Stato e scadenze</h3><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><DetailRow label="Stato Stripe" value={detail.subscription.status} /><DetailRow label="Rinnovi" value={detail.subscription.cancelAtPeriodEnd ? "Disattivati a fine periodo" : "Attivi"} /><DetailRow label="Fine prova" value={formatDate(detail.subscription.trialEndsAt)} /><DetailRow label="Prossima scadenza" value={formatDate(detail.subscription.currentPeriodEndsAt ?? detail.subscription.accessExpiresAt)} /></dl></section>{detail.prime ? <section><h3 className="text-base font-semibold text-ink">Gestione PRIME</h3><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><DetailRow label="Stato PRIME" value={detail.prime.status} /><DetailRow label="Account Manager" value={detail.prime.accountManager?.name ?? "Non assegnato"} /><DetailRow label="Fine accesso PRIME" value={formatDate(detail.prime.accessEndsAt)} /><DetailRow label="Fine grace period" value={formatDate(detail.prime.graceEndsAt)} /></dl></section> : null}<section><h3 className="text-base font-semibold text-ink">Cronologia pagamenti</h3><div className="mt-3 overflow-hidden rounded-lg border border-slate-200"><div className="overflow-x-auto"><table className="min-w-[620px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Stato</th><th className="px-4 py-3">Periodo</th><th className="px-4 py-3 text-right">Importo</th></tr></thead><tbody>{detail.payments.map((payment) => <tr key={payment.id} className="border-t border-slate-100"><td className="px-4 py-3">{formatDate(payment.paidAt ?? payment.createdAt)}</td><td className="px-4 py-3 capitalize">{payment.kind}</td><td className="px-4 py-3">{payment.status}</td><td className="px-4 py-3">{formatDate(payment.periodStart)} - {formatDate(payment.periodEnd)}</td><td className="px-4 py-3 text-right font-semibold">{formatCurrencyCents(payment.amountCents)}</td></tr>)}{!detail.payments.length ? <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">Nessun pagamento registrato.</td></tr> : null}</tbody></table></div></div></section></div></section></div>; }
function DetailMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-lg font-semibold text-ink">{value}</p></div>; }
function DetailRow({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-slate-200 p-3"><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 font-semibold text-ink">{value}</dd></div>; }
function formatDate(value: string | null) { return value ? new Date(value).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }) : "-"; }
