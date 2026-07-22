"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  CreditCard,
  RefreshCcw,
  Search,
  XCircle,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { formatCents } from "@/lib/config/commercial";

type RefundStatus = "pending" | "approved" | "rejected" | "paid";

type RefundRecord = {
  id: string;
  leadPurchaseId: string;
  leadTitle: string;
  propertyManagerName: string;
  propertyManagerEmail: string | null;
  purchaseMode: "shared" | "exclusive" | null;
  purchaseAmountCents: number | null;
  amountCents: number | null;
  status: RefundStatus;
  reason: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

type RefundablePurchase = {
  id: string;
  leadTitle: string;
  propertyManagerName: string;
  propertyManagerEmail: string | null;
  mode: "shared" | "exclusive";
  amountCents: number;
  status: string;
  createdAt: string;
};

type RefundsResponse = {
  stats: {
    pending: number;
    approved: number;
    rejected: number;
    paid: number;
    paidCents: number;
  };
  refunds: RefundRecord[];
  refundablePurchases: RefundablePurchase[];
  error?: string;
};

type FilterState = "all" | RefundStatus;

const emptyStats: RefundsResponse["stats"] = {
  pending: 0,
  approved: 0,
  rejected: 0,
  paid: 0,
  paidCents: 0,
};

export function AdminRefundsConsole() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  const [refundablePurchases, setRefundablePurchases] = useState<RefundablePurchase[]>([]);
  const [stats, setStats] = useState(emptyStats);
  const [filter, setFilter] = useState<FilterState>("all");
  const [query, setQuery] = useState("");
  const [selectedPurchaseId, setSelectedPurchaseId] = useState("");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();

    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadRefunds = useCallback(async () => {
    const token = await getAccessToken();

    setLoading(true);
    setError("");

    if (!token) {
      setError("Sessione admin non trovata.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/admin/refunds", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json()) as RefundsResponse;

    if (!response.ok) {
      setError(payload.error ?? "Non riesco a caricare i rimborsi.");
      setLoading(false);
      return;
    }

    setStats(payload.stats ?? emptyStats);
    setRefunds(payload.refunds ?? []);
    setRefundablePurchases(payload.refundablePurchases ?? []);
    setLoading(false);
  }, [getAccessToken]);

  useEffect(() => {
    void loadRefunds();
  }, [loadRefunds]);

  const selectedPurchase = refundablePurchases.find(
    (purchase) => purchase.id === selectedPurchaseId,
  );
  const filteredRefunds = refunds.filter((refund) => {
    if (filter !== "all" && refund.status !== filter) return false;

    return matchesQuery(query, [
      refund.leadTitle,
      refund.propertyManagerName,
      refund.propertyManagerEmail,
      refund.reason,
      refund.status,
    ]);
  });

  async function createRefund() {
    const token = await getAccessToken();

    if (!token) {
      setError("Sessione admin non trovata.");
      return;
    }

    if (!selectedPurchaseId || !reason.trim()) {
      setError("Seleziona un acquisto e inserisci una motivazione.");
      return;
    }

    setActionLoading("create");
    setError("");
    setSuccess("");

    const response = await fetch("/api/admin/refunds", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        leadPurchaseId: selectedPurchaseId,
        amountCents: amount.trim() ? parseEuroCents(amount) : undefined,
        reason,
      }),
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Rimborso non creato.");
    } else {
      setSelectedPurchaseId("");
      setReason("");
      setAmount("");
      setSuccess("Richiesta rimborso creata.");
      await loadRefunds();
    }

    setActionLoading(null);
  }

  async function updateRefund(refund: RefundRecord, action: "approve" | "reject" | "pay") {
    const token = await getAccessToken();

    if (!token) {
      setError("Sessione admin non trovata.");
      return;
    }

    setActionLoading(`${action}:${refund.id}`);
    setError("");
    setSuccess("");

    const response = await fetch("/api/admin/refunds", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refundId: refund.id,
        action,
      }),
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Aggiornamento rimborso non riuscito.");
    } else {
      setSuccess(
        action === "pay"
          ? "Rimborso accreditato nel wallet."
          : "Rimborso aggiornato.",
      );
      await loadRefunds();
    }

    setActionLoading(null);
  }

  return (
    <div className="grid gap-5">
      <div className="admin-kpi-grid">
        <StatCard label="In attesa" value={String(stats.pending)} tone="slate" />
        <StatCard label="Approvati" value={String(stats.approved)} tone="blue" />
        <StatCard label="Pagati" value={String(stats.paid)} tone="green" />
        <StatCard label="Respinti" value={String(stats.rejected)} tone="red" />
        <StatCard label="Totale rimborsato" value={formatCents(stats.paidCents)} tone="amber" />
      </div>

      <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="card p-4">
          <p className="section-kicker flex items-center gap-2">
            <CreditCard size={15} />
            Nuovo rimborso
          </p>
          <h2 className="mt-2 text-xl font-semibold text-ink">
            Crea rimborso manuale
          </h2>

          <div className="mt-5 grid gap-3">
            <label className="grid gap-2 text-sm font-semibold text-ink">
              Acquisto lead
              <select
                className="filter-select"
                value={selectedPurchaseId}
                onChange={(event) => {
                  const purchase = refundablePurchases.find(
                    (item) => item.id === event.target.value,
                  );
                  setSelectedPurchaseId(event.target.value);
                  setAmount(purchase ? String(purchase.amountCents / 100) : "");
                }}
              >
                <option value="">Seleziona acquisto</option>
                {refundablePurchases.map((purchase) => (
                  <option key={purchase.id} value={purchase.id}>
                    {purchase.leadTitle} - {purchase.propertyManagerName} -{" "}
                    {formatCents(purchase.amountCents)}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-semibold text-ink">
              Importo rimborso
              <input
                className="min-h-11 rounded-lg border border-slate-200 px-3 outline-none focus:border-green"
                inputMode="decimal"
                placeholder={selectedPurchase ? String(selectedPurchase.amountCents / 100) : "0"}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-ink">
              Motivazione
              <textarea
                className="min-h-24 rounded-lg border border-slate-200 p-3 outline-none focus:border-green"
                placeholder="Esempio: contatto non raggiungibile, lead non valido, rimborso commerciale..."
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>

            <button
              className="btn btn-primary"
              type="button"
              disabled={actionLoading === "create"}
              onClick={createRefund}
            >
              <CreditCard size={17} />
              Crea richiesta rimborso
            </button>
          </div>
        </div>

        <div className="card p-4">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="section-kicker">Workflow rimborsi</p>
              <h2 className="mt-2 text-xl font-semibold text-ink">
                Rimborsi da gestire
              </h2>
            </div>
            <button className="btn btn-secondary" type="button" onClick={loadRefunds}>
              <RefreshCcw size={16} />
              Aggiorna
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            <div className="admin-filter-tabs">
              {(["all", "pending", "approved", "paid", "rejected"] as FilterState[]).map(
                (item) => (
                  <button
                    key={item}
                    className={`admin-filter-tab ${
                      filter === item ? "admin-filter-tab-active" : ""
                    }`}
                    type="button"
                    onClick={() => setFilter(item)}
                  >
                    {item === "all" ? "Tutti" : refundStatusLabel(item)}
                  </button>
                ),
              )}
            </div>
            <label className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-500 focus-within:border-green">
              <Search size={16} />
              <input
                className="w-full bg-transparent outline-none"
                placeholder="Cerca per PM, lead o motivo"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
        </div>
      </section>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-xl border border-green/20 bg-green/10 p-3 text-sm font-semibold text-green">
          {success}
        </div>
      ) : null}

      {loading ? (
        <section className="card p-8 text-center text-muted">Carico rimborsi...</section>
      ) : filteredRefunds.length === 0 ? (
        <section className="card p-8 text-center text-muted">
          Nessun rimborso trovato.
        </section>
      ) : (
        <section className="card divide-y divide-slate-200 overflow-hidden">
          {filteredRefunds.map((refund) => (
            <article key={refund.id} className="grid gap-4 p-4 xl:grid-cols-[1fr_auto]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={refundBadgeClassName(refund.status)}>
                    {refundStatusLabel(refund.status)}
                  </span>
                  <span className="text-xs font-semibold text-muted">
                    {formatDateTime(refund.createdAt)}
                  </span>
                </div>
                <h3 className="mt-3 text-lg font-semibold text-ink">{refund.leadTitle}</h3>
                <p className="mt-1 text-sm text-muted">
                  {refund.propertyManagerName}
                  {refund.propertyManagerEmail ? ` · ${refund.propertyManagerEmail}` : ""}
                </p>
                <p className="mt-3 text-sm leading-6 text-muted">{refund.reason}</p>
                <p className="mt-3 text-sm font-semibold text-ink">
                  Rimborso {formatCents(refund.amountCents ?? refund.purchaseAmountCents ?? 0)}
                  {refund.purchaseAmountCents
                    ? ` su acquisto ${formatCents(refund.purchaseAmountCents)}`
                    : ""}
                </p>
              </div>

              <div className="grid min-w-48 gap-2">
                {refund.status === "pending" ? (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={Boolean(actionLoading)}
                    onClick={() => updateRefund(refund, "approve")}
                  >
                    <Clock3 size={16} />
                    Approva
                  </button>
                ) : null}
                {refund.status === "pending" || refund.status === "approved" ? (
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={Boolean(actionLoading)}
                    onClick={() => updateRefund(refund, "pay")}
                  >
                    <CheckCircle2 size={16} />
                    Paga su wallet
                  </button>
                ) : null}
                {refund.status === "pending" || refund.status === "approved" ? (
                  <button
                    className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:border-red-300"
                    type="button"
                    disabled={Boolean(actionLoading)}
                    onClick={() => updateRefund(refund, "reject")}
                  >
                    <XCircle size={16} />
                    Respingi
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "green" | "blue" | "amber" | "red" | "slate";
}) {
  const toneClassName = {
    green: "bg-green/10 text-green",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    slate: "bg-slate-100 text-slate-700",
  }[tone];

  return (
    <div className="card p-4">
      <span className={`rounded-full px-3 py-1 text-xs font-bold ${toneClassName}`}>
        {label}
      </span>
      <p className="mt-4 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function matchesQuery(query: string, values: Array<string | null | undefined>) {
  const cleanQuery = query.trim().toLowerCase();

  if (!cleanQuery) return true;

  return values.filter(Boolean).join(" ").toLowerCase().includes(cleanQuery);
}

function refundStatusLabel(status: FilterState) {
  const labels = {
    all: "Tutti",
    pending: "In attesa",
    approved: "Approvati",
    rejected: "Respinti",
    paid: "Pagati",
  };

  return labels[status];
}

function refundBadgeClassName(status: RefundStatus) {
  const base = "inline-flex rounded-full px-3 py-1 text-xs font-bold";

  if (status === "paid") return `${base} bg-green/10 text-green`;
  if (status === "approved") return `${base} bg-blue-50 text-blue-700`;
  if (status === "rejected") return `${base} bg-red-50 text-red-700`;

  return `${base} bg-slate-100 text-slate-600`;
}

function parseEuroCents(value: string) {
  const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
  const amount = Number.parseFloat(normalized);

  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
