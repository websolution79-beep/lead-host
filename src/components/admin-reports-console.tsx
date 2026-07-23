"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Clock3,
  Mail,
  Search,
  ShieldAlert,
  Send,
  X,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { formatCents } from "@/lib/config/commercial";
import {
  getReportReasonLabel,
  getReportStatusLabel,
  getSupportSubjectLabel,
  type ReportStatus,
} from "@/lib/support/reports";

type AdminReport = {
  id: string;
  subject: string;
  reason: string | null;
  details: string | null;
  adminReply: string | null;
  repliedAt: string | null;
  messages: SupportMessage[];
  status: ReportStatus;
  createdAt: string;
  reviewedAt: string | null;
  leadTitle: string | null;
  purchaseMode: "shared" | "exclusive" | null;
  purchaseAmountCents: number | null;
  propertyManagerName: string;
  propertyManagerEmail: string | null;
};

type SupportMessage = {
  id: string;
  senderType: "pm" | "admin";
  body: string;
  createdAt: string;
};

type AdminReportsResponse = {
  reports: AdminReport[];
  error?: string;
};

type FilterState =
  | "all"
  | "new"
  | "waiting_admin"
  | "waiting_pm"
  | ReportStatus;

const filterOptions: Array<{ value: FilterState; label: string }> = [
  { value: "all", label: "Tutte" },
  { value: "new", label: "Nuove richieste" },
  { value: "waiting_admin", label: "In attesa di risposta" },
  { value: "waiting_pm", label: "In attesa del PM" },
  { value: "reviewing", label: "In lavorazione" },
  { value: "resolved", label: "Risolte" },
  { value: "rejected", label: "Non accolte" },
];

export function AdminReportsConsole() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [filter, setFilter] = useState<FilterState>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [replyLoading, setReplyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedReport = reports.find((report) => report.id === selectedReportId) ?? null;

  const filteredReports = reports.filter((report) => {
    const operationalState = getOperationalState(report);

    if (filter !== "all") {
      const matchesOperationalState =
        filter === "new" || filter === "waiting_admin" || filter === "waiting_pm"
          ? operationalState === filter
          : report.status === filter;

      if (!matchesOperationalState) return false;
    }

    const haystack = [
      report.leadTitle,
      report.propertyManagerName,
      report.propertyManagerEmail,
      getReportReasonLabel(report.reason ?? ""),
      getSupportSubjectLabel(report.subject),
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
    needsReply: reports.filter((item) => isAdminActionRequired(item)).length,
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
      setError(payload.error ?? "Non sono riuscito a caricare le richieste.");
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

  async function sendReply() {
    if (!selectedReport || reply.trim().length < 2) {
      setError("Scrivi una risposta prima di inviarla.");
      return;
    }

    const token = await getAccessToken();

    if (!token) {
      setError("Sessione admin non disponibile.");
      return;
    }

    setReplyLoading(true);
    setError(null);

    const response = await fetch("/api/admin/reports", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reportId: selectedReport.id, reply }),
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Risposta non inviata.");
    } else {
      setReply("");
      await loadReports();
    }

    setReplyLoading(false);
  }

  return (
    <div className="grid gap-5">
      <div className="admin-kpi-grid">
        <StatCard label="Da lavorare" value={stats.needsReply} tone="red" />
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
              Richieste di assistenza
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {filterOptions.map((item) => (
              <button
                key={item.value}
                className={filterButtonClassName(filter === item.value)}
                type="button"
                onClick={() => setFilter(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <label className="mt-4 flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-500 focus-within:border-green">
          <Search size={16} />
          <input
            className="w-full bg-transparent outline-none"
            placeholder="Cerca per lead, PM, oggetto o testo"
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

        <div
          className={`mt-5 grid gap-5 ${
            selectedReport
              ? "lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.82fr)] lg:items-start"
              : ""
          }`}
        >
          <div className="grid gap-3">
            {loading ? (
            <p className="rounded-lg bg-slate-50 p-4 text-sm font-semibold text-muted">
              Carico richieste...
            </p>
            ) : filteredReports.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <p className="font-semibold text-ink">Nessuna richiesta trovata</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                Le richieste inviate dai PM compariranno qui.
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
                      <OperationalStateBadge state={getOperationalState(report)} />
                      <span className="text-xs font-semibold text-muted">
                        {formatDateTime(report.createdAt)}
                      </span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-ink">
                      {report.leadTitle ?? getSupportSubjectLabel(report.subject)}
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-green">
                      {getSupportSubjectLabel(report.subject)}
                    </p>
                    {report.reason ? (
                      <p className="mt-1 text-sm text-muted">
                        Motivo storico: {getReportReasonLabel(report.reason)}
                      </p>
                    ) : null}
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
                    <button
                      className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-green"
                      type="button"
                      onClick={() => setSelectedReportId(report.id)}
                    >
                      <Eye size={16} />
                      {isAdminActionRequired(report)
                        ? "Rispondi al PM"
                        : "Apri dettaglio e rispondi"}
                    </button>
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

        {selectedReport ? (
          <>
            <div
              className="fixed inset-0 z-[90] bg-ink/20 backdrop-blur-[2px] lg:hidden"
              aria-hidden="true"
              onClick={() => {
                setSelectedReportId(null);
                setReply("");
              }}
            />
          <div className="lg:sticky lg:top-5 lg:self-start max-lg:fixed max-lg:inset-x-4 max-lg:bottom-4 max-lg:top-4 max-lg:z-[100] max-lg:overflow-y-auto">
            <SupportRequestDetailPanel
              report={selectedReport}
              reply={reply}
              onReplyChange={setReply}
              onSendReply={() => void sendReply()}
              onClose={() => {
                setSelectedReportId(null);
                setReply("");
              }}
              replyLoading={replyLoading}
            />
          </div>
          </>
        ) : null}
        </div>
      </section>
    </div>
  );
}

function SupportRequestDetailPanel({
  report,
  reply,
  onReplyChange,
  onSendReply,
  onClose,
  replyLoading,
}: {
  report: AdminReport;
  reply: string;
  onReplyChange: (value: string) => void;
  onSendReply: () => void;
  onClose: () => void;
  replyLoading: boolean;
}) {
  return (
    <aside className="rounded-xl border border-green/20 bg-slate-50 p-5 shadow-xl" aria-label="Dettaglio richiesta assistenza" role="dialog">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="section-kicker">Dettaglio richiesta</p>
          <h3 className="mt-2 text-xl font-semibold text-ink">
            {getSupportSubjectLabel(report.subject)}
          </h3>
        </div>
        <button
          className="icon-button min-h-9 px-2"
          type="button"
          aria-label="Chiudi dettaglio"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </div>

      <div className="mt-5 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-muted">
          <span className="font-semibold text-ink">{report.propertyManagerName}</span>
          {report.propertyManagerEmail ? (
            <span className="inline-flex items-center gap-1.5">
              <Mail size={14} />
              {report.propertyManagerEmail}
            </span>
          ) : null}
          <span>{formatDateTime(report.createdAt)}</span>
        </div>
        {report.leadTitle ? (
          <p className="font-semibold text-green">Lead: {report.leadTitle}</p>
        ) : null}
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
            Richiesta del PM
          </p>
          <p className="mt-2 whitespace-pre-wrap leading-7 text-ink">
            {report.details ?? "Nessun testo inserito."}
          </p>
        </div>
        {report.messages.length > 0 ? (
          <div className="rounded-lg border border-green/20 bg-green/5 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-green">
              Conversazione
            </p>
            <div className="mt-3 grid gap-3">
              {report.messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-lg border p-3 ${
                    message.senderType === "admin"
                      ? "border-green/20 bg-white"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="flex flex-wrap justify-between gap-2 text-xs font-bold text-muted">
                    <span>{message.senderType === "admin" ? "Admin" : "Property Manager"}</span>
                    <span>{formatDateTime(message.createdAt)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap leading-7 text-ink">
                    {message.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3">
        <label className="grid gap-2 text-sm font-semibold text-ink">
          Rispondi al Property Manager
          <textarea
            className="min-h-32 rounded-lg border border-slate-200 bg-white px-4 py-3 leading-7 outline-none transition focus:border-green"
            maxLength={2000}
            placeholder="Scrivi una risposta chiara e utile..."
            value={reply}
            onChange={(event) => onReplyChange(event.target.value)}
          />
        </label>
        <button
          className="btn btn-primary justify-center sm:w-fit"
          type="button"
          disabled={replyLoading}
          onClick={onSendReply}
        >
          <Send size={16} />
          {replyLoading ? "Invio in corso..." : "Invia risposta via email"}
        </button>
        <p className="text-xs leading-5 text-muted">
          La risposta verrà salvata nello storico e inviata all’indirizzo email del PM.
        </p>
      </div>
    </aside>
  );
}

type OperationalState = "new" | "waiting_admin" | "waiting_pm" | "resolved" | "rejected";

function getOperationalState(report: AdminReport): OperationalState {
  if (report.status === "resolved") return "resolved";
  if (report.status === "rejected") return "rejected";

  const lastMessage = report.messages.at(-1);

  if (lastMessage?.senderType === "pm") return "waiting_admin";
  if (lastMessage?.senderType === "admin" || report.adminReply) return "waiting_pm";
  if (report.status === "pending") return "new";

  return "waiting_admin";
}

function isAdminActionRequired(report: AdminReport) {
  const state = getOperationalState(report);

  return state === "new" || state === "waiting_admin";
}

function OperationalStateBadge({ state }: { state: OperationalState }) {
  const labels: Record<OperationalState, string> = {
    new: "Nuova richiesta",
    waiting_admin: "Richiede risposta",
    waiting_pm: "In attesa del PM",
    resolved: "Risolta",
    rejected: "Non accolta",
  };
  const classes: Record<OperationalState, string> = {
    new: "bg-amber-50 text-amber-700",
    waiting_admin: "bg-red-50 text-red-700",
    waiting_pm: "bg-blue-50 text-blue-700",
    resolved: "bg-green/10 text-green",
    rejected: "bg-red-50 text-red-700",
  };

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${classes[state]}`}>
      {labels[state]}
    </span>
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
