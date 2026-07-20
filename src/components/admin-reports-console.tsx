"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Mail,
  Search,
  ShieldAlert,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { formatCents } from "@/lib/config/commercial";
import {
  getReportReasonLabel,
  getReportStatusLabel,
  type ReportStatus,
} from "@/lib/support/reports";

type AdminReport = {
  id: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  createdAt: string;
  reviewedAt: string | null;
  leadTitle: string;
  purchaseMode: "shared" | "exclusive" | null;
  purchaseAmountCents: number | null;
  propertyManagerName: string;
  propertyManagerEmail: string | null;
};

type AdminReportsResponse = {
  reports: AdminReport[];
  error?: string;
};

type FilterState = "all" | ReportStatus;

export function AdminReportsConsole() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [filter, setFilter] = useState<FilterState>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredReports = reports.filter((report) => {
    if (filter !== "all" && report.status !== filter) return false;

    const haystack = [
      report.leadTitle,
      report.propertyManagerName,
      report.propertyManagerEmail,
      getReportReasonLabel(report.reason),
      report.details,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return query.trim() ? haystack.includes(query.trim().toLowerCase()) : true;
  });

  const stats = {
    pending: reports.filter((item) => item.status === "pending").length,
    reviewing: reports.filter((item) => item.status === "reviewing").length,
    resolved: reports.filter((item) => item.status === "resolved").length,
    rejected: reports.filter((item) => item.status === "rejected").length,
  };

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();

    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadReports = useCallback(async () => {
    const token = await getAccessToken();

    setLoading(true);
    setError(null);

    if (!token) {
      setError("Sessione admin non disponibile.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/admin/reports", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json()) as AdminReportsResponse;

    if (!response.ok) {
      setError(payload.error ?? "Non sono riuscito a caricare le segnalazioni.");
      setLoading(false);
      return;
    }

    setReports(payload.reports ?? []);
    setLoading(false);
  }, [getAccessToken]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  async function updateStatus(reportId: string, status: ReportStatus) {
    const token = await getAccessToken();

    if (!token) {
      setError("Sessione admin non disponibile.");
      return;
    }

    setActionLoading(reportId);
    setError(null);

    const response = await fetch("/api/admin/reports", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reportId, status }),
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Aggiornamento non completato.");
    } else {
      await loadReports();
    }

    setActionLoading(null);
  }

  return (
    <div className="grid gap-5">
      <div className="admin-kpi-grid">
        <StatCard label="Inviate" value={stats.pending} tone="slate" />
        <StatCard label="In lavorazione" value={stats.reviewing} tone="blue" />
        <StatCard label="Risolte" value={stats.resolved} tone="green" />
        <StatCard label="Non accolte" value={stats.rejected} tone="red" />
      </div>

      <section className="card p-4">
        <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-center">
          <div>
            <p className="section-kicker flex items-center gap-2">
              <ShieldAlert size={15} />
              Revisione manuale
            </p>
            <h2 className="mt-2 text-xl font-semibold text-ink">
              Segnalazioni lead
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["all", "pending", "reviewing", "resolved", "rejected"] as FilterState[]).map(
              (item) => (
                <button
                  key={item}
                  className={filterButtonClassName(filter === item)}
                  type="button"
                  onClick={() => setFilter(item)}
                >
                  {item === "all" ? "Tutte" : getReportStatusLabel(item)}
                </button>
              ),
            )}
          </div>
        </div>

        <label className="mt-4 flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-500 focus-within:border-green">
          <Search size={16} />
          <input
            className="w-full bg-transparent outline-none"
            placeholder="Cerca per lead, PM o motivo"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
            {error}
          </div>
        ) : null}

        <div className="mt-5 grid gap-3">
          {loading ? (
            <p className="rounded-lg bg-slate-50 p-4 text-sm font-semibold text-muted">
              Carico segnalazioni...
            </p>
          ) : filteredReports.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <p className="font-semibold text-ink">Nessuna segnalazione trovata</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                Le segnalazioni inviate dai PM compariranno qui.
              </p>
            </div>
          ) : (
            filteredReports.map((report) => (
              <article
                key={report.id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={statusBadgeClassName(report.status)}>
                        {getReportStatusLabel(report.status)}
                      </span>
                      <span className="text-xs font-semibold text-muted">
                        {formatDateTime(report.createdAt)}
                      </span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-ink">
                      {report.leadTitle}
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-green">
                      {getReportReasonLabel(report.reason)}
                    </p>
                    <p className="mt-3 max-w-3xl leading-7 text-muted">
                      {report.details}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3 text-sm text-muted">
                      <span>{report.propertyManagerName}</span>
                      {report.propertyManagerEmail ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Mail size={14} />
                          {report.propertyManagerEmail}
                        </span>
                      ) : null}
                      {report.purchaseAmountCents ? (
                        <span>
                          {report.purchaseMode === "exclusive"
                            ? "Esclusiva"
                            : "Condiviso"}{" "}
                          {formatCents(report.purchaseAmountCents)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid min-w-48 gap-2">
                    <button
                      className="btn btn-secondary"
                      type="button"
                      disabled={actionLoading === report.id}
                      onClick={() => updateStatus(report.id, "reviewing")}
                    >
                      <Clock3 size={16} />
                      In lavorazione
                    </button>
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={actionLoading === report.id}
                      onClick={() => updateStatus(report.id, "resolved")}
                    >
                      <CheckCircle2 size={16} />
                      Risolta
                    </button>
                    <button
                      className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:border-red-300"
                      type="button"
                      disabled={actionLoading === report.id}
                      onClick={() => updateStatus(report.id, "rejected")}
                    >
                      Non accolta
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "blue" | "slate" | "red";
}) {
  const toneClassName = {
    green: "bg-green/10 text-green",
    blue: "bg-blue-50 text-blue-700",
    slate: "bg-slate-100 text-slate-700",
    red: "bg-red-50 text-red-700",
  }[tone];

  return (
    <div className="card p-4">
      <span className={`rounded-full px-3 py-1 text-xs font-bold ${toneClassName}`}>
        {label}
      </span>
      <p className="mt-4 text-3xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function filterButtonClassName(isActive: boolean) {
  return `min-h-10 rounded-lg px-4 text-sm font-semibold transition ${
    isActive
      ? "bg-green text-white"
      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
  }`;
}

function statusBadgeClassName(status: ReportStatus) {
  const base = "inline-flex rounded-full px-3 py-1 text-xs font-bold";

  if (status === "resolved") return `${base} bg-green/10 text-green`;
  if (status === "reviewing") return `${base} bg-blue-50 text-blue-700`;
  if (status === "rejected") return `${base} bg-red-50 text-red-700`;

  return `${base} bg-slate-100 text-slate-600`;
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
