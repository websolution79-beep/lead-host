"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BadgeEuro,
  Banknote,
  Clock3,
  FileWarning,
  Inbox,
  MessageSquareWarning,
  RefreshCw,
  ShoppingCart,
  Target,
  UserRoundCheck,
  Users,
  WalletCards,
} from "lucide-react";
import {
  MetricCard,
  RangeSelector,
  TrendBars,
} from "@/components/admin-analytics-elements";
import {
  DASHBOARD_RANGE_OPTIONS,
  type AnalyticsRangeKey,
} from "@/lib/admin/business-analytics";
import { useBusinessAnalytics } from "@/lib/admin/use-business-analytics";
import { formatCurrencyCents } from "@/lib/auth/roles";

export function AdminDashboardConsole() {
  const [range, setRange] = useState<AnalyticsRangeKey>("today");
  const { payload, loading, refreshing, error, reload } =
    useBusinessAnalytics({ range });

  if (loading && !payload) {
    return <DashboardSkeleton />;
  }

  if (error || !payload) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">
        {error || "Dati dashboard non disponibili."}
      </div>
    );
  }

  const { current, previous, snapshot } = payload;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <RangeSelector
          value={range}
          options={DASHBOARD_RANGE_OPTIONS}
          onChange={setRange}
        />
        <div className="flex items-center gap-3">
          <p className="text-xs font-semibold text-slate-500">
            Aggiornato {formatDateTime(payload.generatedAt)}
          </p>
          <button
            className="icon-button"
            type="button"
            aria-label="Aggiorna Dashboard"
            title="Aggiorna Dashboard"
            disabled={refreshing}
            onClick={reload}
          >
            <RefreshCw
              size={17}
              className={refreshing ? "animate-spin" : undefined}
            />
          </button>
        </div>
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="section-kicker">Performance</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">
              Risultati: {payload.range.label}
            </h2>
          </div>
          <p className="text-xs font-semibold text-slate-500">
            Variazioni rispetto al periodo precedente
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <MetricCard
            icon={Banknote}
            label="Ricariche wallet"
            value={formatCurrencyCents(current.topUpCents)}
            current={current.topUpCents}
            previous={previous.topUpCents}
            detail={`${current.topUpCount} ricariche completate`}
          />
          <MetricCard
            icon={BadgeEuro}
            label="Valore acquisti Lead"
            value={formatCurrencyCents(current.purchaseValueCents)}
            current={current.purchaseValueCents}
            previous={previous.purchaseValueCents}
            detail="Credito utilizzato nel marketplace"
            accent="blue"
          />
          <MetricCard
            icon={ShoppingCart}
            label="Numero acquisti"
            value={String(current.purchases)}
            current={current.purchases}
            previous={previous.purchases}
            detail={`${current.sharedPurchases} condivisi · ${current.exclusivePurchases} esclusive`}
            accent="slate"
          />
          <MetricCard
            icon={UserRoundCheck}
            label="PM acquirenti"
            value={String(current.uniqueBuyers)}
            current={current.uniqueBuyers}
            previous={previous.uniqueBuyers}
            detail={`${current.averagePurchasesPerBuyer} acquisti medi per cliente`}
          />
          <MetricCard
            icon={Target}
            label="Acquisto medio"
            value={formatCurrencyCents(current.averagePurchaseCents)}
            current={current.averagePurchaseCents}
            previous={previous.averagePurchaseCents}
            detail="Valore medio per transazione Lead"
            accent="amber"
          />
          <MetricCard
            icon={Inbox}
            label="Nuovi Lead proprietari"
            value={String(current.ownerRequests)}
            current={current.ownerRequests}
            previous={previous.ownerRequests}
            detail={`${current.publishedLeads} pubblicati nel periodo`}
          />
        </div>
      </section>

      <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[1.4fr_0.6fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="section-kicker">Andamento</p>
              <h2 className="mt-1 text-xl font-semibold text-ink">
                Lead e acquisti
              </h2>
            </div>
            <Link
              href="/admin/analytics"
              className="text-sm font-bold text-green hover:underline"
            >
              Apri Analytics
            </Link>
          </div>
          <div className="mt-5">
            <TrendBars
              rows={payload.trends}
              series={[
                {
                  key: "ownerRequests",
                  label: "Lead arrivati",
                  color: "bg-emerald-600",
                },
                {
                  key: "purchases",
                  label: "Acquisti",
                  color: "bg-slate-800",
                },
              ]}
            />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="section-kicker">Marketplace</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">
            Modalità di acquisto
          </h2>
          <div className="mt-5 grid gap-3">
            <ModeRow
              label="Condivisi"
              count={current.sharedPurchases}
              valueCents={current.sharedValueCents}
            />
            <ModeRow
              label="Esclusive"
              count={current.exclusivePurchases}
              valueCents={current.exclusiveValueCents}
            />
            <ModeRow
              label="Riaccrediti"
              count={current.refundCount}
              valueCents={current.refundCents}
              tone="warning"
            />
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3">
          <p className="section-kicker">Situazione attuale</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">
            Cose da presidiare
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <OperationalTile
            icon={WalletCards}
            label="Credito nei wallet"
            value={formatCurrencyCents(snapshot.walletBalanceCents)}
            href="/admin/pagamenti"
          />
          <OperationalTile
            icon={Clock3}
            label="Lead da verificare"
            value={snapshot.pendingReview}
            href="/admin/leads"
            alert={snapshot.pendingReview > 0}
          />
          <OperationalTile
            icon={Inbox}
            label="Lead disponibili"
            value={snapshot.availableLeads}
            href="/admin/leads"
          />
          <OperationalTile
            icon={FileWarning}
            label="Scadono entro 24 ore"
            value={snapshot.expiringSoon}
            href="/admin/leads"
            alert={snapshot.expiringSoon > 0}
          />
          <OperationalTile
            icon={MessageSquareWarning}
            label="Assistenze da rispondere"
            value={snapshot.supportAwaitingAdmin}
            href="/admin/segnalazioni"
            alert={snapshot.supportAwaitingAdmin > 0}
          />
          <OperationalTile
            icon={Users}
            label="PM attivi"
            value={snapshot.activePropertyManagers}
            href="/admin/property-manager"
          />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="section-kicker">Attività recente</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">
              Ultimi eventi reali
            </h2>
          </div>
          <p className="text-xs font-semibold text-slate-500">
            Lead, wallet, acquisti e assistenza
          </p>
        </div>
        <div className="mt-5 divide-y divide-slate-100">
          {payload.recentActivity.length ? (
            payload.recentActivity.map((activity, index) => (
              <Link
                key={`${activity.type}-${activity.createdAt}-${index}`}
                href={activity.href}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 hover:text-green"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{activity.type}</p>
                  <p className="mt-1 truncate text-sm text-muted">
                    {activity.label} · {activity.detail}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  {activity.amountCents !== null ? (
                    <span className="font-bold text-ink">
                      {formatCurrencyCents(activity.amountCents)}
                    </span>
                  ) : null}
                  <span className="text-xs font-semibold text-slate-500">
                    {formatDateTime(activity.createdAt)}
                  </span>
                </div>
              </Link>
            ))
          ) : (
            <p className="rounded-lg border border-dashed border-slate-200 p-5 text-sm text-muted">
              Nessuna attività registrata.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function OperationalTile({
  icon: Icon,
  label,
  value,
  href,
  alert = false,
}: {
  icon: typeof Inbox;
  label: string;
  value: string | number;
  href: string;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`min-w-0 rounded-lg border bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-md ${
        alert ? "border-amber-300" : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
            alert
              ? "bg-amber-50 text-amber-700"
              : "bg-slate-100 text-slate-700"
          }`}
        >
          <Icon size={18} />
        </span>
        {alert ? (
          <span className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-bold uppercase text-amber-800">
            Da gestire
          </span>
        ) : null}
      </div>
      <p className="mt-4 break-words text-2xl font-semibold text-ink">
        {value}
      </p>
      <p className="mt-1 text-sm font-semibold text-muted">{label}</p>
    </Link>
  );
}

function ModeRow({
  label,
  count,
  valueCents,
  tone = "default",
}: {
  label: string;
  count: number;
  valueCents: number;
  tone?: "default" | "warning";
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-lg border p-4 ${
        tone === "warning"
          ? "border-amber-200 bg-amber-50"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      <div>
        <p className="text-sm font-bold text-ink">{label}</p>
        <p className="mt-1 text-xs font-semibold text-muted">
          {count} operazioni
        </p>
      </div>
      <p className="text-lg font-semibold text-ink">
        {formatCurrencyCents(valueCents)}
      </p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid animate-pulse gap-6">
      <div className="h-12 rounded-lg bg-slate-100" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-40 rounded-lg bg-slate-100" />
        ))}
      </div>
      <div className="h-72 rounded-lg bg-slate-100" />
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
