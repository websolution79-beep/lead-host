"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, CircleDollarSign, RefreshCw, TrendingUp } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { formatCurrencyCents } from "@/lib/auth/roles";

type CountRow = {
  label: string;
  value: number;
};

type AnalyticsPayload = {
  generatedAt: string;
  analytics: {
    totals: {
      ownerRequests: number;
      propertyManagers: number;
      activeProfiles: number;
      publishedLeads: number;
      soldLeads: number;
      leadPurchases: number;
      leadRevenueCents: number;
      topUpCents: number;
      refundCents: number;
      netWalletMovementCents: number;
      averageLeadRevenueCents: number;
      publicationRate: number;
      salesRate: number;
    };
    funnel: CountRow[];
    acquisitionByChannel: CountRow[];
    leadStatus: CountRow[];
    revenueByMode: Array<{
      label: string;
      valueCents: number;
      count: number;
    }>;
    last7Days: Array<{
      label: string;
      acquired: number;
      published: number;
      purchases: number;
      revenueCents: number;
    }>;
    topCities: CountRow[];
    topServices: CountRow[];
    operations: {
      reportsByStatus: CountRow[];
      refundsByStatus: CountRow[];
      emailsByStatus: CountRow[];
    };
  };
  error?: string;
};

export function AdminAnalyticsConsole() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [payload, setPayload] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();

    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError("");

    const token = await getAccessToken();

    if (!token) {
      setError("Sessione admin non trovata.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/admin/analytics", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const result = (await response.json()) as AnalyticsPayload;

    if (!response.ok) {
      setError(result.error ?? "Non sono riuscito a caricare gli analytics.");
      setLoading(false);
      return;
    }

    setPayload(result);
    setLoading(false);
  }, [getAccessToken]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadAnalytics(), 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadAnalytics]);

  if (loading) {
    return <div className="card p-8 text-center text-muted">Caricamento analytics...</div>;
  }

  if (error || !payload) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">
        {error || "Analytics non disponibili."}
      </div>
    );
  }

  const { analytics } = payload;
  const maxFunnel = Math.max(...analytics.funnel.map((row) => row.value), 1);
  const maxDay = Math.max(
    ...analytics.last7Days.map((row) => Math.max(row.acquired, row.published, row.purchases)),
    1,
  );

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm font-semibold text-muted">
          Aggiornato il {formatDateTime(payload.generatedAt)}
        </p>
        <button className="btn btn-secondary" type="button" onClick={() => void loadAnalytics()}>
          <RefreshCw size={17} />
          Aggiorna
        </button>
      </div>

      <div className="admin-kpi-grid">
        <KpiCard
          icon={TrendingUp}
          label="Lead acquisiti"
          value={analytics.totals.ownerRequests}
        />
        <KpiCard
          icon={BarChart3}
          label="Tasso pubblicazione"
          value={`${analytics.totals.publicationRate}%`}
        />
        <KpiCard
          icon={BarChart3}
          label="Tasso vendita"
          value={`${analytics.totals.salesRate}%`}
        />
        <KpiCard
          icon={CircleDollarSign}
          label="Ricavo medio lead"
          value={formatCurrencyCents(analytics.totals.averageLeadRevenueCents)}
        />
      </div>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="card p-5">
          <p className="section-kicker">Funnel</p>
          <h2 className="mt-2 text-xl font-semibold text-ink">Dal lead acquisito alla vendita</h2>
          <div className="mt-5 grid gap-3">
            {analytics.funnel.map((row) => (
              <BarRow
                key={row.label}
                label={row.label}
                value={row.value}
                max={maxFunnel}
              />
            ))}
          </div>
        </div>

        <div className="card p-5">
          <p className="section-kicker">Economia</p>
          <h2 className="mt-2 text-xl font-semibold text-ink">Wallet e lead</h2>
          <div className="mt-5 grid gap-3">
            <MoneyRow label="Ricariche wallet" value={analytics.totals.topUpCents} />
            <MoneyRow label="Ricavi lead" value={analytics.totals.leadRevenueCents} />
            <MoneyRow label="Rimborsi pagati" value={analytics.totals.refundCents} />
            <MoneyRow label="Movimento netto wallet" value={analytics.totals.netWalletMovementCents} />
          </div>
        </div>
      </section>

      <section className="card p-5">
        <p className="section-kicker">Ultimi 7 giorni</p>
        <h2 className="mt-2 text-xl font-semibold text-ink">Acquisizione, pubblicazione e vendite</h2>
        <div className="mt-5 grid gap-3">
          {analytics.last7Days.map((row) => (
            <div key={row.label} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-ink">{row.label}</p>
                <p className="text-sm font-semibold text-muted">
                  {formatCurrencyCents(row.revenueCents)}
                </p>
              </div>
              <MiniBars
                max={maxDay}
                values={[
                  { label: "Acquisiti", value: row.acquired, className: "bg-green" },
                  { label: "Pubblicati", value: row.published, className: "bg-blue-500" },
                  { label: "Acquisti", value: row.purchases, className: "bg-slate-800" },
                ]}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <RankCard title="Canali acquisizione" rows={analytics.acquisitionByChannel} />
        <RankCard title="Città più presenti" rows={analytics.topCities} />
        <RankCard title="Servizi più richiesti" rows={analytics.topServices} />
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <RankCard title="Stato lead" rows={analytics.leadStatus} />
        <RankCard title="Segnalazioni" rows={analytics.operations.reportsByStatus} />
        <RankCard title="Email transazionali" rows={analytics.operations.emailsByStatus} />
      </section>

      <section className="card p-5">
        <p className="section-kicker">Ricavi per modalità</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {analytics.revenueByMode.map((row) => (
            <div key={row.label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-muted">{row.label}</p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {formatCurrencyCents(row.valueCents)}
              </p>
              <p className="mt-1 text-sm text-muted">{row.count} acquisti</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string | number;
}) {
  return (
    <article className="card p-5">
      <span className="flex size-10 items-center justify-center rounded-xl bg-green/10 text-green">
        <Icon size={20} />
      </span>
      <p className="mt-4 text-3xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-sm font-medium text-muted">{label}</p>
    </article>
  );
}

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-ink">{label}</span>
        <span className="text-sm font-bold text-muted">{value}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-green" style={{ width: `${(value / max) * 100}%` }} />
      </div>
    </div>
  );
}

function MiniBars({
  max,
  values,
}: {
  max: number;
  values: Array<{ label: string; value: number; className: string }>;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {values.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between text-xs font-semibold text-muted">
            <span>{item.label}</span>
            <span>{item.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white">
            <div
              className={`h-full rounded-full ${item.className}`}
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function MoneyRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <span className="text-sm font-semibold text-muted">{label}</span>
      <span className="font-bold text-ink">{formatCurrencyCents(value)}</span>
    </div>
  );
}

function RankCard({ title, rows }: { title: string; rows: CountRow[] }) {
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <div className="card p-5">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-4 grid gap-3">
        {rows.length ? (
          rows.slice(0, 6).map((row) => (
            <BarRow key={row.label} label={formatLabel(row.label)} value={row.value} max={max} />
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-muted">
            Nessun dato disponibile.
          </p>
        )}
      </div>
    </div>
  );
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

function formatLabel(value: string) {
  return value.replaceAll("_", " ");
}
