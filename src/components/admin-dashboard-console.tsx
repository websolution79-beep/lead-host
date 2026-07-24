"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BadgeCheck,
  Clock3,
  CreditCard,
  FileWarning,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { formatCurrencyCents } from "@/lib/auth/roles";

type AnalyticsPayload = {
  dashboard: {
    kpis: {
      acquiredToday: number;
      pendingReview: number;
      publishedLeads: number;
      monthRevenueCents: number;
    };
    queues: {
      waitingCompletion: number;
      duplicateWarnings: number;
      openReports: number;
      pendingRefunds: number;
    };
    recentActivity: Array<{
      type: string;
      label: string;
      detail: string;
      createdAt: string;
    }>;
  };
  analytics: {
    totals: {
      ownerRequests: number;
      propertyManagers: number;
      leadPurchases: number;
      leadRevenueCents: number;
      publicationRate: number;
      salesRate: number;
    };
  };
  error?: string;
};

export function AdminDashboardConsole() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [payload, setPayload] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();

    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadDashboard = useCallback(async () => {
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
      setError(result.error ?? "Non sono riuscito a caricare la dashboard.");
      setLoading(false);
      return;
    }

    setPayload(result);
    setLoading(false);
  }, [getAccessToken]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadDashboard(), 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadDashboard]);

  if (loading) {
    return <div className="card p-8 text-center text-muted">Caricamento dashboard...</div>;
  }

  if (error || !payload) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">
        {error || "Dati dashboard non disponibili."}
      </div>
    );
  }

  const { dashboard, analytics } = payload;

  return (
    <div className="grid gap-6">
      <div className="admin-kpi-grid">
        <KpiCard
          icon={TrendingUp}
          label="Acquisiti oggi"
          value={dashboard.kpis.acquiredToday}
        />
        <KpiCard
          icon={Clock3}
          label="Da verificare"
          value={dashboard.kpis.pendingReview}
        />
        <KpiCard
          icon={BadgeCheck}
          label="Pubblicati"
          value={dashboard.kpis.publishedLeads}
        />
        <KpiCard
          icon={CreditCard}
          label="Ricavi mese"
          value={formatCurrencyCents(dashboard.kpis.monthRevenueCents)}
        />
      </div>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="card p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="section-kicker">Code operative</p>
              <h2 className="mt-2 text-xl font-semibold text-ink">Cose da presidiare</h2>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label="Aggiorna dashboard"
              onClick={() => void loadDashboard()}
            >
              <RefreshCw size={17} />
            </button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <QueueTile label="Da completare" value={dashboard.queues.waitingCompletion} />
            <QueueTile label="Possibili duplicati" value={dashboard.queues.duplicateWarnings} />
            <QueueTile label="Segnalazioni aperte" value={dashboard.queues.openReports} />
            <QueueTile label="Riaccrediti in gestione" value={dashboard.queues.pendingRefunds} />
          </div>
        </div>

        <div className="card p-5">
          <p className="section-kicker">Performance</p>
          <h2 className="mt-2 text-xl font-semibold text-ink">Sintesi marketplace</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <QueueTile label="Richieste totali" value={analytics.totals.ownerRequests} />
            <QueueTile label="Property Manager" value={analytics.totals.propertyManagers} />
            <QueueTile label="Acquisti lead" value={analytics.totals.leadPurchases} />
            <QueueTile label="Ricavi lead" value={formatCurrencyCents(analytics.totals.leadRevenueCents)} />
            <QueueTile label="Tasso pubblicazione" value={`${analytics.totals.publicationRate}%`} />
            <QueueTile label="Tasso vendita" value={`${analytics.totals.salesRate}%`} />
          </div>
        </div>
      </section>

      <section className="card p-5">
        <p className="section-kicker">Attività recente</p>
        <h2 className="mt-2 text-xl font-semibold text-ink">Ultimi eventi reali</h2>
        <div className="mt-5 grid gap-3">
          {dashboard.recentActivity.length ? (
            dashboard.recentActivity.map((activity) => (
              <div
                key={`${activity.type}-${activity.createdAt}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <div>
                  <p className="font-semibold text-ink">{activity.type}</p>
                  <p className="mt-1 text-sm text-muted">
                    {activity.label} · {formatActivityDetail(activity.detail)}
                  </p>
                </div>
                <span className="text-sm font-semibold text-slate-500">
                  {formatDateTime(activity.createdAt)}
                </span>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 p-5 text-muted">
              Nessuna attività registrata.
            </div>
          )}
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
  icon: typeof AlertCircle;
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

function QueueTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2">
        <FileWarning size={15} className="text-green" />
        <p className="text-sm font-semibold text-muted">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
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

function formatActivityDetail(value: string) {
  const cents = Number(value);

  if (Number.isFinite(cents) && value.trim() && cents > 99) {
    return formatCurrencyCents(cents);
  }

  return value;
}
