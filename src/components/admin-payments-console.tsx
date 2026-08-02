"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CreditCard,
  ExternalLink,
  ReceiptText,
  RefreshCcw,
  Search,
  ShoppingBag,
  Sparkles,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { formatCents } from "@/lib/config/commercial";
import {
  PaginationControls,
  type PaginationState,
} from "@/components/pagination-controls";

type PaymentRecord = {
  id: string;
  provider: string;
  providerPaymentId: string | null;
  providerCheckoutSessionId: string | null;
  propertyManagerName: string;
  propertyManagerEmail: string | null;
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

type AddonCustomerRecord = {
  id: string;
  profileId: string;
  productName: string;
  propertyManagerName: string;
  propertyManagerEmail: string | null;
  status: string;
  source: "stripe" | "manual";
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  currentPeriodStartedAt: string | null;
  currentPeriodEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  accessExpiresAt: string | null;
  nextChargeAt: string | null;
  nextChargeCents: number | null;
  currency: string;
  paymentCount: number;
  totalPaidCents: number;
  lastPaymentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type AddonPaymentDetail = {
  id: string;
  paymentKind: "initial" | "renewal" | "adjustment";
  provider: string;
  providerInvoiceId: string | null;
  providerPaymentIntentId: string | null;
  amountCents: number;
  currency: string;
  status: string;
  billingPeriodStartedAt: string | null;
  billingPeriodEndsAt: string | null;
  paidAt: string | null;
  createdAt: string;
  invoiceNumber: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
};

type AddonCustomerDetail = {
  customer: {
    profileId: string;
    name: string;
    companyName: string | null;
    email: string;
    phone: string | null;
    accountStatus: string;
    registeredAt: string;
  };
  product: {
    name: string;
    salePriceCents: number | null;
    currency: string;
    billingInterval: string;
    billingIntervalCount: number;
  };
  subscription: {
    id: string;
    status: string;
    source: "stripe" | "manual";
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    stripePriceId: string | null;
    trialStartedAt: string | null;
    trialEndsAt: string | null;
    currentPeriodStartedAt: string | null;
    currentPeriodEndsAt: string | null;
    cancelAtPeriodEnd: boolean;
    canceledAt: string | null;
    accessExpiresAt: string | null;
    nextChargeAt: string | null;
    nextChargeCents: number | null;
    manualReason: string | null;
    createdAt: string;
    updatedAt: string;
  };
  summary: {
    paymentCount: number;
    totalPaidCents: number;
  };
  payments: AddonPaymentDetail[];
};

type PaymentsResponse = {
  stats: {
    topUpsCents: number;
    leadSalesCents: number;
    refundsCents: number;
    failedPayments: number;
    pendingTopUps: number;
    addonSalesCents: number;
    addonFailedPayments: number;
  };
  payments: PaymentRecord[];
  walletTransactions: WalletTransactionRecord[];
  leadPurchases: LeadPurchaseRecord[];
  addonCustomers: AddonCustomerRecord[];
  pagination: PaginationState;
  error?: string;
};

type ActiveTab = "payments" | "wallet" | "lead_purchases" | "addon_payments";

const emptyStats: PaymentsResponse["stats"] = {
  topUpsCents: 0,
  leadSalesCents: 0,
  refundsCents: 0,
  failedPayments: 0,
  pendingTopUps: 0,
  addonSalesCents: 0,
  addonFailedPayments: 0,
};

const emptyPagination: PaginationState = {
  page: 1,
  pageSize: 25,
  total: 0,
  totalPages: 1,
};

export function AdminPaymentsConsole() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [activeTab, setActiveTab] = useState<ActiveTab>("payments");
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransactionRecord[]>([]);
  const [leadPurchases, setLeadPurchases] = useState<LeadPurchaseRecord[]>([]);
  const [addonCustomers, setAddonCustomers] = useState<AddonCustomerRecord[]>([]);
  const [selectedAddonCustomer, setSelectedAddonCustomer] =
    useState<AddonCustomerDetail | null>(null);
  const [addonDetailLoading, setAddonDetailLoading] = useState(false);
  const [addonDetailError, setAddonDetailError] = useState("");
  const [stats, setStats] = useState(emptyStats);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pageByTab, setPageByTab] = useState<Record<ActiveTab, number>>({
    payments: 1,
    wallet: 1,
    lead_purchases: 1,
    addon_payments: 1,
  });
  const [paginationByTab, setPaginationByTab] = useState<
    Record<ActiveTab, PaginationState>
  >({
    payments: emptyPagination,
    wallet: emptyPagination,
    lead_purchases: emptyPagination,
    addon_payments: emptyPagination,
  });
  const loadedPageByTab = useRef(new Map<ActiveTab, number>());

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();

    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadPayments = useCallback(async (
    tab: ActiveTab,
    page: number,
    force = false,
  ) => {
    if (!force && loadedPageByTab.current.get(tab) === page) {
      return;
    }

    const token = await getAccessToken();

    setLoading(true);
    setError("");

    if (!token) {
      setError("Sessione admin non trovata.");
      setLoading(false);
      return;
    }

    const response = await fetch(
      `/api/admin/payments?tab=${tab}&page=${page}&pageSize=25`,
      {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      },
    );
    const payload = (await response.json()) as PaymentsResponse;

    if (!response.ok) {
      setError(payload.error ?? "Non riesco a caricare i pagamenti.");
      setLoading(false);
      return;
    }

    setStats(payload.stats ?? emptyStats);
    if (tab === "payments") {
      setPayments(payload.payments ?? []);
    } else if (tab === "wallet") {
      setWalletTransactions(payload.walletTransactions ?? []);
    } else if (tab === "lead_purchases") {
      setLeadPurchases(payload.leadPurchases ?? []);
    } else {
      setAddonCustomers(payload.addonCustomers ?? []);
    }
    setPaginationByTab((current) => ({
      ...current,
      [tab]: payload.pagination ?? {
        ...emptyPagination,
        page,
      },
    }));
    loadedPageByTab.current.set(tab, page);
    setLoading(false);
  }, [getAccessToken]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadPayments(activeTab, pageByTab[activeTab]);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [activeTab, loadPayments, pageByTab]);

  const filteredPayments = payments.filter((payment) =>
    matchesQuery(query, [
      payment.provider,
      payment.status,
      payment.providerPaymentId,
      payment.providerCheckoutSessionId,
      payment.propertyManagerName,
      payment.propertyManagerEmail,
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
  const filteredAddonCustomers = addonCustomers.filter((customer) =>
    matchesQuery(query, [
      customer.productName,
      customer.propertyManagerName,
      customer.propertyManagerEmail,
      customer.status,
      customer.stripeCustomerId,
      customer.stripeSubscriptionId,
    ]),
  );

  const openAddonCustomer = useCallback(async (subscriptionId: string) => {
    const token = await getAccessToken();
    setSelectedAddonCustomer(null);
    setAddonDetailError("");
    setAddonDetailLoading(true);

    if (!token) {
      setAddonDetailError("Sessione admin non trovata.");
      setAddonDetailLoading(false);
      return;
    }

    const response = await fetch(
      `/api/admin/payments/addons/${subscriptionId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    ).catch(() => null);
    const payload = response
      ? ((await response.json().catch(() => ({}))) as AddonCustomerDetail & {
          error?: string;
        })
      : null;

    if (!response?.ok || !payload) {
      setAddonDetailError(
        payload?.error ?? "Non riesco a caricare il dettaglio dell'abbonamento.",
      );
      setAddonDetailLoading(false);
      return;
    }

    setSelectedAddonCustomer(payload);
    setAddonDetailLoading(false);
  }, [getAccessToken]);

  return (
    <div className="grid gap-5">
      <div className="admin-kpi-grid">
        <StatCard label="Ricariche wallet" value={formatCents(stats.topUpsCents)} tone="green" />
        <StatCard label="Vendite lead" value={formatCents(stats.leadSalesCents)} tone="blue" />
        <StatCard label="Riaccrediti Wallet" value={formatCents(stats.refundsCents)} tone="amber" />
        <StatCard label="Falliti/annullati" value={String(stats.failedPayments)} tone="red" />
        <StatCard label="Ricariche pending" value={String(stats.pendingTopUps)} tone="slate" />
        <StatCard label="Modulo Marketing" value={formatCents(stats.addonSalesCents)} tone="blue" />
        <StatCard label="Insoluti Marketing" value={String(stats.addonFailedPayments)} tone="red" />
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
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() =>
              loadPayments(activeTab, pageByTab[activeTab], true)
            }
          >
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
            <TabButton
              active={activeTab === "addon_payments"}
              label="Modulo Marketing"
              onClick={() => setActiveTab("addon_payments")}
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
              payment.propertyManagerName,
              payment.propertyManagerEmail,
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

      {!loading && activeTab === "addon_payments" ? (
        <AddonCustomerList customers={filteredAddonCustomers} onOpen={openAddonCustomer} />
      ) : null}

      {!loading && paginationByTab[activeTab].totalPages > 1 ? (
        <section className="card overflow-hidden">
          <PaginationControls
            pagination={paginationByTab[activeTab]}
            disabled={loading}
            onPageChange={(page) =>
              setPageByTab((current) => ({
                ...current,
                [activeTab]: page,
              }))
            }
          />
        </section>
      ) : null}

      {selectedAddonCustomer || addonDetailLoading || addonDetailError ? (
        <AddonCustomerDrawer
          detail={selectedAddonCustomer}
          loading={addonDetailLoading}
          error={addonDetailError}
          onClose={() => {
            setSelectedAddonCustomer(null);
            setAddonDetailError("");
          }}
        />
      ) : null}
    </div>
  );
}

function AddonCustomerList({
  customers,
  onOpen,
}: {
  customers: AddonCustomerRecord[];
  onOpen: (subscriptionId: string) => void;
}) {
  if (!customers.length) {
    return (
      <section className="card p-8 text-center text-muted">
        Nessun cliente del Modulo Marketing trovato.
      </section>
    );
  }

  return (
    <section className="grid gap-3">
      {customers.map((customer) => {
        const isTrial = customer.status === "trialing";
        const nextChargeLabel = isTrial ? "Primo pagamento" : "Prossimo rinnovo";

        return (
          <article
            key={customer.id}
            className="card grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 rounded-lg bg-green/10 p-2 text-green">
                <Sparkles size={18} />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="break-words font-semibold text-ink">
                    {customer.propertyManagerName}
                  </h3>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${addonStatusClassName(customer.status)}`}>
                    {addonStatusLabel(customer.status)}
                  </span>
                  {customer.cancelAtPeriodEnd ? (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                      Disdetta programmata
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 break-all text-sm text-muted">
                  {customer.propertyManagerEmail ?? "Email non disponibile"}
                </p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                  {customer.nextChargeAt && customer.nextChargeCents !== null ? (
                    <p className={isTrial ? "font-bold text-blue-700" : "font-semibold text-ink"}>
                      {nextChargeLabel}: {formatDate(customer.nextChargeAt)} · {formatCents(customer.nextChargeCents)}
                    </p>
                  ) : (
                    <p className="font-semibold text-muted">
                      Nessun addebito futuro programmato
                    </p>
                  )}
                  <p className="text-muted">
                    Incassato: <strong className="text-ink">{formatCents(customer.totalPaidCents)}</strong>
                  </p>
                  <p className="text-muted">
                    Transazioni: <strong className="text-ink">{customer.paymentCount}</strong>
                  </p>
                </div>
              </div>
            </div>
            <button className="btn btn-secondary w-full lg:w-auto" type="button" onClick={() => onOpen(customer.id)}>
              <UserRound size={16} />
              Dettaglio e transazioni
            </button>
          </article>
        );
      })}
    </section>
  );
}

function AddonCustomerDrawer({
  detail,
  loading,
  error,
  onClose,
}: {
  detail: AddonCustomerDetail | null;
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label="Dettaglio abbonamento Modulo Marketing">
      <button className="absolute inset-0 cursor-default" type="button" aria-label="Chiudi dettaglio" onClick={onClose} />
      <section className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl bg-white shadow-2xl sm:max-w-4xl sm:rounded-xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-4 sm:p-5">
          <div>
            <p className="section-kicker">Modulo Marketing</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">
              {detail?.customer.name ?? "Dettaglio cliente"}
            </h2>
            {detail?.customer.email ? <p className="mt-1 break-all text-sm text-muted">{detail.customer.email}</p> : null}
          </div>
          <button className="btn btn-secondary h-10 w-10 shrink-0 p-0" type="button" onClick={onClose} aria-label="Chiudi">
            <X size={18} />
          </button>
        </header>

        <div className="overflow-y-auto p-4 sm:p-5">
          {loading ? <div className="py-12 text-center text-muted">Carico il dettaglio...</div> : null}
          {!loading && error ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
              <AlertTriangle size={17} className="mt-0.5 shrink-0" />
              {error}
            </div>
          ) : null}
          {!loading && detail ? <AddonCustomerDetailContent detail={detail} /> : null}
        </div>
      </section>
    </div>
  );
}

function AddonCustomerDetailContent({ detail }: { detail: AddonCustomerDetail }) {
  const { customer, product, subscription, summary, payments } = detail;
  const isTrial = subscription.status === "trialing";

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DetailMetric label="Stato" value={addonStatusLabel(subscription.status)} />
        <DetailMetric
          label={isTrial ? "Fine prova gratuita" : "Scadenza periodo"}
          value={formatDate(subscription.trialEndsAt ?? subscription.currentPeriodEndsAt ?? subscription.accessExpiresAt)}
        />
        <DetailMetric
          label={isTrial ? "Primo pagamento" : "Prossimo addebito"}
          value={subscription.nextChargeAt && subscription.nextChargeCents !== null
            ? `${formatDate(subscription.nextChargeAt)} · ${formatCents(subscription.nextChargeCents)}`
            : "Non programmato"}
        />
        <DetailMetric label="Totale incassato" value={formatCents(summary.totalPaidCents)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 p-4">
          <h3 className="font-semibold text-ink">Cliente</h3>
          <dl className="mt-3 grid gap-3 text-sm">
            <DetailRow label="Nome" value={customer.name} />
            <DetailRow label="Società" value={customer.companyName} />
            <DetailRow label="Email" value={customer.email} />
            <DetailRow label="Telefono" value={customer.phone} />
            <DetailRow label="Stato account" value={statusLabel(customer.accountStatus)} />
            <DetailRow label="Registrato il" value={formatDateTime(customer.registeredAt)} />
          </dl>
        </section>
        <section className="rounded-lg border border-slate-200 p-4">
          <h3 className="font-semibold text-ink">Abbonamento</h3>
          <dl className="mt-3 grid gap-3 text-sm">
            <DetailRow label="Prodotto" value={product.name} />
            <DetailRow label="Prezzo mensile" value={formatCents(product.salePriceCents ?? 0)} />
            <DetailRow label="Origine" value={subscription.source === "stripe" ? "Stripe" : "Assegnazione manuale"} />
            <DetailRow label="Cliente Stripe" value={subscription.stripeCustomerId} />
            <DetailRow label="Abbonamento Stripe" value={subscription.stripeSubscriptionId} />
            <DetailRow label="Price Stripe" value={subscription.stripePriceId} />
            {subscription.manualReason ? <DetailRow label="Nota accesso" value={subscription.manualReason} /> : null}
          </dl>
        </section>
      </div>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="section-kicker">Storico economico</p>
            <h3 className="mt-1 text-lg font-semibold text-ink">Transazioni Modulo Marketing</h3>
          </div>
          <span className="text-sm font-semibold text-muted">{summary.paymentCount} transazioni</span>
        </div>
        {payments.length ? (
          <div className="mt-3 grid gap-3">
            {payments.map((payment) => (
              <article key={payment.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink">{paymentKindLabel(payment.paymentKind)}</p>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${paymentStatusClassName(payment.status)}`}>
                        {statusLabel(payment.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted">{formatDateTime(payment.paidAt ?? payment.createdAt)}</p>
                  </div>
                  <p className="text-lg font-semibold text-ink">{formatCents(payment.amountCents)}</p>
                </div>
                <div className="mt-3 grid gap-1 text-sm text-muted sm:grid-cols-2">
                  <p>Fattura: <span className="break-all font-medium text-ink">{payment.invoiceNumber ?? payment.providerInvoiceId ?? "Non disponibile"}</span></p>
                  <p>Periodo: <span className="font-medium text-ink">{formatBillingPeriod(payment.billingPeriodStartedAt, payment.billingPeriodEndsAt)}</span></p>
                </div>
                {payment.hostedInvoiceUrl || payment.invoicePdfUrl ? (
                  <a className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-green hover:underline" href={payment.hostedInvoiceUrl ?? payment.invoicePdfUrl ?? "#"} target="_blank" rel="noreferrer">
                    <ExternalLink size={15} />
                    Apri documento Stripe
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-muted">
            {isTrial
              ? `Nessun pagamento ancora registrato. Il primo addebito è previsto il ${formatDate(subscription.nextChargeAt)}.`
              : "Nessuna transazione registrata per questo abbonamento."}
          </div>
        )}
      </section>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase text-muted">{label}</p>
      <p className="mt-2 break-words font-semibold text-ink">{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[130px_minmax(0,1fr)]">
      <dt className="font-semibold text-muted">{label}</dt>
      <dd className="break-all text-ink">{value || "Non disponibile"}</dd>
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
    refund: "Riaccredito Wallet",
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
    refunded: "Riaccreditato",
    active: "Attivo",
    suspended: "Sospeso",
    trialing: "Prova gratuita",
    past_due: "Pagamento in ritardo",
    unpaid: "Non pagato",
    incomplete: "Incompleto",
    incomplete_expired: "Attivazione scaduta",
  };

  return labels[status] ?? status;
}

function addonStatusLabel(status: string) {
  return statusLabel(status);
}

function addonStatusClassName(status: string) {
  if (["active", "trialing"].includes(status)) return "bg-green/10 text-green";
  if (["past_due", "incomplete"].includes(status)) return "bg-amber-50 text-amber-700";
  if (["unpaid", "incomplete_expired"].includes(status)) return "bg-red-50 text-red-700";
  return "bg-slate-100 text-slate-700";
}

function paymentStatusClassName(status: string) {
  if (status === "paid") return "bg-green/10 text-green";
  if (["failed", "uncollectible"].includes(status)) return "bg-red-50 text-red-700";
  return "bg-slate-100 text-slate-700";
}

function paymentKindLabel(kind: AddonPaymentDetail["paymentKind"]) {
  if (kind === "initial") return "Prima attivazione";
  if (kind === "renewal") return "Rinnovo";
  return "Rettifica";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Non disponibile";

  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatBillingPeriod(start: string | null, end: string | null) {
  if (!start && !end) return "Non disponibile";
  if (!start) return `fino al ${formatDate(end)}`;
  if (!end) return `dal ${formatDate(start)}`;
  return `${formatDate(start)} - ${formatDate(end)}`;
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
