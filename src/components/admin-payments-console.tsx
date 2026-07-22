"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CreditCard,
  ReceiptText,
  RefreshCcw,
  Search,
  ShoppingBag,
  WalletCards,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { formatCents } from "@/lib/config/commercial";

type PaymentRecord = {
  id: string;
  provider: string;
  providerPaymentId: string | null;
  providerCheckoutSessionId: string | null;
  amountCents: number;
  currency: string;
  status: string;
  createdAt: string;
  confirmedAt: string | null;
};

type WalletTransactionRecord = {
  id: string;
  profileEmail: string | null;
  profileName: string;
  type: "top_up" | "lead_purchase" | "refund" | "adjustment";
  status: string;
  amountCents: number;
  balanceAfterCents: number | null;
  description: string | null;
  provider: string | null;
  providerReference: string | null;
  createdAt: string;
  completedAt: string | null;
};

type LeadPurchaseRecord = {
  id: string;
  leadTitle: string;
  propertyManagerName: string;
  propertyManagerEmail: string | null;
  mode: "shared" | "exclusive";
  amountCents: number;
  status: string;
  createdAt: string;
};

type PaymentsResponse = {
  stats: {
    topUpsCents: number;
    leadSalesCents: number;
    refundsCents: number;
    failedPayments: number;
    pendingTopUps: number;
  };
  payments: PaymentRecord[];
  walletTransactions: WalletTransactionRecord[];
  leadPurchases: LeadPurchaseRecord[];
  error?: string;
};

type ActiveTab = "payments" | "wallet" | "lead_purchases";

const emptyStats: PaymentsResponse["stats"] = {
  topUpsCents: 0,
  leadSalesCents: 0,
  refundsCents: 0,
  failedPayments: 0,
  pendingTopUps: 0,
};

export function AdminPaymentsConsole() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [activeTab, setActiveTab] = useState<ActiveTab>("payments");
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransactionRecord[]>([]);
  const [leadPurchases, setLeadPurchases] = useState<LeadPurchaseRecord[]>([]);
  const [stats, setStats] = useState(emptyStats);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();

    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadPayments = useCallback(async () => {
    const token = await getAccessToken();

    setLoading(true);
    setError("");

    if (!token) {
      setError("Sessione admin non trovata.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/admin/payments", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json()) as PaymentsResponse;

    if (!response.ok) {
      setError(payload.error ?? "Non riesco a caricare i pagamenti.");
      setLoading(false);
      return;
    }

    setStats(payload.stats ?? emptyStats);
    setPayments(payload.payments ?? []);
    setWalletTransactions(payload.walletTransactions ?? []);
    setLeadPurchases(payload.leadPurchases ?? []);
    setLoading(false);
  }, [getAccessToken]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  const filteredPayments = payments.filter((payment) =>
    matchesQuery(query, [
      payment.provider,
      payment.status,
      payment.providerPaymentId,
      payment.providerCheckoutSessionId,
    ]),
  );
  const filteredWalletTransactions = walletTransactions.filter((transaction) =>
    matchesQuery(query, [
      transaction.profileName,
      transaction.profileEmail,
      transaction.description,
      transaction.type,
      transaction.status,
      transaction.providerReference,
    ]),
  );
  const filteredLeadPurchases = leadPurchases.filter((purchase) =>
    matchesQuery(query, [
      purchase.leadTitle,
      purchase.propertyManagerName,
      purchase.propertyManagerEmail,
      purchase.mode,
      purchase.status,
    ]),
  );

  return (
    <div className="grid gap-5">
      <div className="admin-kpi-grid">
        <StatCard label="Ricariche wallet" value={formatCents(stats.topUpsCents)} tone="green" />
        <StatCard label="Vendite lead" value={formatCents(stats.leadSalesCents)} tone="blue" />
        <StatCard label="Rimborsi" value={formatCents(stats.refundsCents)} tone="amber" />
        <StatCard label="Falliti/annullati" value={String(stats.failedPayments)} tone="red" />
        <StatCard label="Ricariche pending" value={String(stats.pendingTopUps)} tone="slate" />
      </div>

      <section className="card p-4">
        <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-center">
          <div>
            <p className="section-kicker flex items-center gap-2">
              <ReceiptText size={15} />
              Monitoraggio economico
            </p>
            <h2 className="mt-2 text-xl font-semibold text-ink">
              Pagamenti, wallet e acquisti lead
            </h2>
          </div>
          <button className="btn btn-secondary" type="button" onClick={loadPayments}>
            <RefreshCcw size={16} />
            Aggiorna
          </button>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[auto_1fr] lg:items-center">
          <div className="admin-filter-tabs">
            <TabButton
              active={activeTab === "payments"}
              label="Pagamenti Stripe"
              onClick={() => setActiveTab("payments")}
            />
            <TabButton
              active={activeTab === "wallet"}
              label="Movimenti wallet"
              onClick={() => setActiveTab("wallet")}
            />
            <TabButton
              active={activeTab === "lead_purchases"}
              label="Acquisti lead"
              onClick={() => setActiveTab("lead_purchases")}
            />
          </div>
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-500 focus-within:border-green">
            <Search size={16} />
            <input
              className="w-full bg-transparent outline-none"
              placeholder="Cerca per PM, lead, stato o riferimento"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>

        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
            {error}
          </div>
        ) : null}
      </section>

      {loading ? (
        <section className="card p-8 text-center text-muted">Carico pagamenti...</section>
      ) : null}

      {!loading && activeTab === "payments" ? (
        <RecordList
          emptyText="Nessun pagamento Stripe trovato."
          records={filteredPayments.map((payment) => ({
            id: payment.id,
            icon: CreditCard,
            title: `${formatCents(payment.amountCents)} - ${statusLabel(payment.status)}`,
            subtitle: [
              payment.provider,
              payment.providerCheckoutSessionId,
              payment.providerPaymentId,
            ]
              .filter(Boolean)
              .join(" · "),
            meta: formatDateTime(payment.confirmedAt ?? payment.createdAt),
            tone: payment.status === "completed" ? "green" : "slate",
          }))}
        />
      ) : null}

      {!loading && activeTab === "wallet" ? (
        <RecordList
          emptyText="Nessun movimento wallet trovato."
          records={filteredWalletTransactions.map((transaction) => ({
            id: transaction.id,
            icon: WalletCards,
            title: `${transactionTypeLabel(transaction.type)} · ${formatSignedCents(transaction.amountCents)}`,
            subtitle: [
              transaction.profileName,
              transaction.profileEmail,
              transaction.description,
              `Saldo ${formatCents(transaction.balanceAfterCents ?? 0)}`,
            ]
              .filter(Boolean)
              .join(" · "),
            meta: formatDateTime(transaction.completedAt ?? transaction.createdAt),
            tone: transaction.status === "completed" ? "green" : "slate",
          }))}
        />
      ) : null}

      {!loading && activeTab === "lead_purchases" ? (
        <RecordList
          emptyText="Nessun acquisto lead trovato."
          records={filteredLeadPurchases.map((purchase) => ({
            id: purchase.id,
            icon: ShoppingBag,
            title: `${purchase.leadTitle} · ${formatCents(purchase.amountCents)}`,
            subtitle: [
              purchase.mode === "exclusive" ? "Esclusiva" : "Condiviso",
              purchase.propertyManagerName,
              purchase.propertyManagerEmail,
              statusLabel(purchase.status),
            ]
              .filter(Boolean)
              .join(" · "),
            meta: formatDateTime(purchase.createdAt),
            tone: purchase.status === "refunded" ? "amber" : "green",
          }))}
        />
      ) : null}
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

function RecordList({
  records,
  emptyText,
}: {
  records: Array<{
    id: string;
    icon: typeof CreditCard;
    title: string;
    subtitle: string;
    meta: string;
    tone: "green" | "amber" | "slate";
  }>;
  emptyText: string;
}) {
  if (!records.length) {
    return <section className="card p-8 text-center text-muted">{emptyText}</section>;
  }

  return (
    <section className="card divide-y divide-slate-200 overflow-hidden">
      {records.map((record) => (
        <article key={record.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
          <div className="flex min-w-0 items-start gap-3">
            <span className={`mt-0.5 rounded-lg p-2 ${recordTone(record.tone)}`}>
              <record.icon size={17} />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-ink">{record.title}</p>
              <p className="mt-1 break-words text-sm text-muted">{record.subtitle}</p>
            </div>
          </div>
          <p className="text-sm font-semibold text-muted">{record.meta}</p>
        </article>
      ))}
    </section>
  );
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`admin-filter-tab ${active ? "admin-filter-tab-active" : ""}`}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function matchesQuery(query: string, values: Array<string | null | undefined>) {
  const cleanQuery = query.trim().toLowerCase();

  if (!cleanQuery) return true;

  return values.filter(Boolean).join(" ").toLowerCase().includes(cleanQuery);
}

function recordTone(tone: "green" | "amber" | "slate") {
  if (tone === "green") return "bg-green/10 text-green";
  if (tone === "amber") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-700";
}

function transactionTypeLabel(type: WalletTransactionRecord["type"]) {
  const labels = {
    top_up: "Ricarica wallet",
    lead_purchase: "Acquisto lead",
    refund: "Rimborso",
    adjustment: "Rettifica",
  };

  return labels[type];
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    created: "Creato",
    pending: "Pending",
    completed: "Completato",
    failed: "Fallito",
    cancelled: "Annullato",
    paid: "Pagato",
    contact_unlocked: "Contatto sbloccato",
    refunded: "Rimborsato",
  };

  return labels[status] ?? status;
}

function formatSignedCents(value: number) {
  return `${value > 0 ? "+" : ""}${formatCents(value)}`;
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
