"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CalendarRange,
  Coins,
  Download,
  HandCoins,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { formatCurrencyCents } from "@/lib/auth/roles";

type EarningsEvent = {
  id: string;
  eventType: string;
  status: "accrued" | "voided";
  amountCents: number;
  baseAmountCents: number | null;
  rateBasisPoints: number | null;
  description: string;
  occurredAt: string;
  voidReason: string | null;
  paidCents: number;
  propertyManagerFirstName: string | null;
  propertyManagerLastName: string | null;
  leadTitle: string | null;
};

type EarningsPayout = {
  id: string;
  status: "completed" | "voided";
  amountCents: number;
  paymentMethod: string;
  paymentReference: string | null;
  notes: string | null;
  paidAt: string;
  voidReason: string | null;
};

type EarningsPayload = {
  featureEnabled: boolean;
  member: {
    memberId: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    roleName: string;
  };
  rules: {
    leadVerificationEnabled: boolean;
    primeFirstActivationEnabled: boolean;
    primeRenewalEnabled: boolean;
    primeLeadPurchaseEnabled: boolean;
    leadVerificationCents: number;
    primeFirstActivationCents: number;
    primeRenewalCents: number;
    primeLeadPurchaseBasisPoints: number;
  };
  summary: {
    eventCount: number;
    grossAccruedCents: number;
    adjustmentsCents: number;
    netAccruedCents: number;
    paidCents: number;
    dueCents: number;
  };
  events: EarningsEvent[];
  payouts: EarningsPayout[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  error?: string;
};

type RangeKey =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "current_month"
  | "previous_month"
  | "current_year"
  | "custom";

export function TeamMemberEarnings() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [payload, setPayload] = useState<EarningsPayload | null>(null);
  const [page, setPage] = useState(1);
  const [rangeKey, setRangeKey] = useState<RangeKey>("current_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [eventType, setEventType] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const selectedRange = useMemo(
    () => resolveRange(rangeKey, customFrom, customTo),
    [customFrom, customTo, rangeKey],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      setError("Sessione Team non disponibile.");
      setLoading(false);
      return;
    }

    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (selectedRange.dateFrom) params.set("dateFrom", selectedRange.dateFrom);
    if (selectedRange.dateTo) params.set("dateTo", selectedRange.dateTo);
    if (eventType) params.set("eventType", eventType);
    const response = await fetch(
      `/api/admin/team/my-earnings?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    const result = (await response.json()) as EarningsPayload;

    if (!response.ok) {
      setError(result.error ?? "Non riesco a caricare i tuoi guadagni.");
    } else {
      setPayload(result);
    }
    setLoading(false);
  }, [eventType, page, selectedRange.dateFrom, selectedRange.dateTo, supabase]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  if (loading && !payload) {
    return <div className="card p-6 text-sm font-semibold text-muted">Caricamento guadagni...</div>;
  }

  if (error && !payload) {
    return (
      <div className="card p-6">
        <p className="text-sm font-semibold text-red-700">{error}</p>
        <button className="btn mt-4" type="button" onClick={() => void load()}>
          <RefreshCw size={16} /> Riprova
        </button>
      </div>
    );
  }

  if (!payload) return null;

  const activeRules = getActiveRules(payload.rules);

  async function downloadCsv() {
    setDownloading(true);
    setError("");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setError("Sessione Team non disponibile.");
      setDownloading(false);
      return;
    }
    const params = new URLSearchParams({ format: "csv" });
    if (selectedRange.dateFrom) params.set("dateFrom", selectedRange.dateFrom);
    if (selectedRange.dateTo) params.set("dateTo", selectedRange.dateTo);
    if (eventType) params.set("eventType", eventType);
    const response = await fetch(`/api/admin/team/my-earnings?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      setError(result.error ?? "Non riesco a esportare i guadagni.");
      setDownloading(false);
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `guadagni-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setDownloading(false);
  }

  return (
    <div className="grid min-w-0 gap-6">
      {!payload.featureEnabled ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <strong>Area compensi in preparazione.</strong> Le regole sono configurate, ma la maturazione automatica non è ancora attiva.
        </div>
      ) : null}

      <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="section-kicker">Il tuo ruolo</p>
          <h2 className="mt-1 break-words text-xl font-semibold text-ink">{payload.member.roleName}</h2>
          <p className="mt-1 break-all text-sm text-muted">{payload.member.email}</p>
        </div>
        <button className="btn w-full sm:w-auto" type="button" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} size={16} /> Aggiorna
        </button>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <CalendarRange className="text-green" size={18} />
          <div>
            <p className="section-kicker">Periodo</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">Analizza i tuoi compensi</h2>
          </div>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <label className="grid gap-2 text-sm font-semibold text-ink">
            Intervallo
            <select className="input" value={rangeKey} onChange={(event) => { setRangeKey(event.target.value as RangeKey); setPage(1); }}>
              <option value="today">Oggi</option>
              <option value="yesterday">Ieri</option>
              <option value="last_7_days">Ultimi 7 giorni</option>
              <option value="last_30_days">Ultimi 30 giorni</option>
              <option value="current_month">Mese in corso</option>
              <option value="previous_month">Mese scorso</option>
              <option value="current_year">Anno in corso</option>
              <option value="custom">Periodo personalizzato</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-ink">
            Attività
            <select className="input" value={eventType} onChange={(event) => { setEventType(event.target.value); setPage(1); }}>
              <option value="">Tutte le attività</option>
              <option value="lead_verification">Verifica Lead</option>
              <option value="prime_first_activation">Nuovo PM PRIME</option>
              <option value="prime_renewal">Rinnovo PM PRIME</option>
              <option value="prime_lead_purchase">Acquisto Lead PM PRIME</option>
              <option value="refund_adjustment">Rettifiche rimborso</option>
              <option value="manual_adjustment">Rettifiche manuali</option>
            </select>
          </label>
          <button className="btn w-full lg:w-auto" type="button" onClick={() => void downloadCsv()} disabled={downloading}>
            <Download size={16} /> {downloading ? "Esportazione..." : "Scarica CSV"}
          </button>
        </div>
        {rangeKey === "custom" ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-ink">Dal<input className="input" type="date" value={customFrom} onChange={(event) => { setCustomFrom(event.target.value); setPage(1); }} /></label>
            <label className="grid gap-2 text-sm font-semibold text-ink">Al<input className="input" type="date" value={customTo} onChange={(event) => { setCustomTo(event.target.value); setPage(1); }} /></label>
          </div>
        ) : null}
        <p className="mt-3 text-sm text-muted">{selectedRange.label}</p>
        {error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Guadagnato nel periodo" value={payload.summary.netAccruedCents} icon={Coins} tone="green" />
        <SummaryCard label="Rettifiche" value={payload.summary.adjustmentsCents} icon={ReceiptText} tone="amber" />
        <SummaryCard label="Già pagato sul maturato" value={payload.summary.paidCents} icon={Banknote} tone="blue" />
        <SummaryCard label="Da ricevere sul maturato" value={payload.summary.dueCents} icon={HandCoins} tone="green" />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <p className="section-kicker">Regole personali</p>
        <h2 className="mt-1 text-xl font-semibold text-ink">Compensi previsti dal ruolo</h2>
        {activeRules.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {activeRules.map((rule) => (
              <div className="rounded-lg bg-slate-50 p-4" key={rule.label}>
                <p className="text-sm font-semibold text-slate-600">{rule.label}</p>
                <p className="mt-2 text-xl font-bold text-ink">{rule.value}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">Nessun compenso associato al ruolo.</p>
        )}
      </section>

      <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-kicker">Cronologia</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">Compensi maturati</h2>
          </div>
          <p className="text-sm text-muted">{payload.pagination.totalItems} movimenti</p>
        </div>

        {payload.events.length ? (
          <div className="mt-4 grid gap-3">
            {payload.events.map((event) => (
              <article className="rounded-lg border border-slate-200 p-4" key={event.id}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={event.amountCents < 0 ? "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800" : "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"}>
                        {eventTypeLabel(event.eventType)}
                      </span>
                      <span className="text-xs font-semibold text-slate-500">{formatDateTime(event.occurredAt)}</span>
                    </div>
                    <h3 className="mt-2 break-words font-semibold text-ink">{event.description}</h3>
                    {event.leadTitle ? <p className="mt-1 text-sm text-muted">Lead: {event.leadTitle}</p> : null}
                    {propertyManagerName(event) ? <p className="mt-1 text-sm text-muted">Property Manager: {propertyManagerName(event)}</p> : null}
                  </div>
                  <div className="shrink-0 text-left sm:text-right">
                    <p className={`text-lg font-bold ${event.amountCents < 0 ? "text-amber-700" : "text-ink"}`}>
                      {event.amountCents > 0 ? "+" : ""}{formatCurrencyCents(event.amountCents)}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{paymentState(event)}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-lg bg-slate-50 p-6 text-center text-sm text-muted">Nessun compenso maturato.</div>
        )}

        {payload.pagination.totalPages > 1 ? (
          <div className="mt-5 flex items-center justify-between gap-3">
            <button className="btn" type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>Precedente</button>
            <span className="text-sm font-semibold text-muted">Pagina {payload.pagination.page} di {payload.pagination.totalPages}</span>
            <button className="btn" type="button" disabled={page >= payload.pagination.totalPages || loading} onClick={() => setPage((current) => current + 1)}>Successiva</button>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <p className="section-kicker">Liquidazioni</p>
        <h2 className="mt-1 text-xl font-semibold text-ink">Pagamenti ricevuti</h2>
        {payload.payouts.length ? (
          <div className="mt-4 grid gap-3">
            {payload.payouts.map((payout) => (
              <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between" key={payout.id}>
                <div>
                  <p className="font-semibold text-ink">{paymentMethodLabel(payout.paymentMethod)}</p>
                  <p className="mt-1 text-sm text-muted">{formatDateTime(payout.paidAt)}{payout.paymentReference ? ` · ${payout.paymentReference}` : ""}</p>
                </div>
                <div className="sm:text-right">
                  <p className={payout.status === "completed" ? "text-lg font-bold text-emerald-700" : "text-lg font-bold text-slate-400 line-through"}>{formatCurrencyCents(payout.amountCents)}</p>
                  <p className="text-xs font-semibold text-slate-500">{payout.status === "completed" ? "Pagato" : "Annullato"}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">Nessun pagamento registrato.</p>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof ShieldCheck; tone: "green" | "amber" | "blue" }) {
  const toneClass = tone === "amber" ? "bg-amber-50 text-amber-700" : tone === "blue" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700";
  return <div className="rounded-lg border border-slate-200 bg-white p-5"><div className={`flex size-10 items-center justify-center rounded-lg ${toneClass}`}><Icon size={19} /></div><p className="mt-4 text-sm font-semibold text-muted">{label}</p><p className="mt-2 text-2xl font-bold text-ink">{formatCurrencyCents(value)}</p></div>;
}

function getActiveRules(rules: EarningsPayload["rules"]) {
  return [
    rules.leadVerificationEnabled ? { label: "Lead verificato", value: formatCurrencyCents(rules.leadVerificationCents) } : null,
    rules.primeFirstActivationEnabled ? { label: "Nuovo PM PRIME", value: formatCurrencyCents(rules.primeFirstActivationCents) } : null,
    rules.primeRenewalEnabled ? { label: "Rinnovo PM PRIME", value: formatCurrencyCents(rules.primeRenewalCents) } : null,
    rules.primeLeadPurchaseEnabled ? { label: "Acquisto Lead PM PRIME", value: `${(rules.primeLeadPurchaseBasisPoints / 100).toLocaleString("it-IT", { maximumFractionDigits: 2 })}%` } : null,
  ].filter((rule): rule is { label: string; value: string } => Boolean(rule));
}

function eventTypeLabel(type: string) {
  if (type === "lead_verification") return "Verifica Lead";
  if (type === "prime_first_activation") return "Nuovo PRIME";
  if (type === "prime_renewal") return "Rinnovo PRIME";
  if (type === "prime_lead_purchase") return "Acquisto Lead PRIME";
  if (type === "refund_adjustment") return "Rettifica rimborso";
  return "Rettifica manuale";
}

function propertyManagerName(event: EarningsEvent) {
  return [event.propertyManagerFirstName, event.propertyManagerLastName].filter(Boolean).join(" ");
}

function paymentState(event: EarningsEvent) {
  if (event.status === "voided") return "Annullato";
  if (event.amountCents < 0) return "Rettifica applicata";
  if (event.paidCents >= event.amountCents) return "Pagato";
  if (event.paidCents > 0) return `Pagato parzialmente: ${formatCurrencyCents(event.paidCents)}`;
  return "Da pagare";
}

function paymentMethodLabel(method: string) {
  if (method === "bank_transfer") return "Bonifico bancario";
  if (method === "paypal") return "PayPal";
  if (method === "cash") return "Contanti";
  return "Altro metodo";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function resolveRange(range: RangeKey, customFrom: string, customTo: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let from: Date | null = null;
  let to: Date | null = null;

  if (range === "today") {
    from = today;
    to = addDays(today, 1);
  } else if (range === "yesterday") {
    from = addDays(today, -1);
    to = today;
  } else if (range === "last_7_days") {
    from = addDays(today, -6);
    to = addDays(today, 1);
  } else if (range === "last_30_days") {
    from = addDays(today, -29);
    to = addDays(today, 1);
  } else if (range === "current_month") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  } else if (range === "previous_month") {
    from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    to = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (range === "current_year") {
    from = new Date(now.getFullYear(), 0, 1);
    to = new Date(now.getFullYear() + 1, 0, 1);
  } else {
    from = customFrom ? localDate(customFrom) : null;
    to = customTo ? addDays(localDate(customTo), 1) : null;
  }

  const dateFormatter = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" });
  const label = from && to
    ? `Dal ${dateFormatter.format(from)} al ${dateFormatter.format(new Date(to.getTime() - 1))}`
    : range === "custom"
      ? "Seleziona data iniziale e finale."
      : "Tutto il periodo disponibile.";

  return {
    dateFrom: from?.toISOString() ?? "",
    dateTo: to?.toISOString() ?? "",
    label,
  };
}

function localDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(value: Date, days: number) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + days);
}
