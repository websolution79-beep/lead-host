"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  LifeBuoy,
  Send,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import {
  getReportStatusLabel,
  getSupportSubjectLabel,
  supportSubjectOptions,
  type SupportSubject,
} from "@/lib/support/reports";

type SupportPurchase = {
  id: string;
  leadId: string;
  leadTitle: string;
  mode: "shared" | "exclusive";
  amountCents: number;
  createdAt: string;
};

type SupportReport = {
  id: string;
  leadPurchaseId: string | null;
  leadTitle: string | null;
  subject: SupportSubject;
  reason: string | null;
  details: string | null;
  status: "pending" | "reviewing" | "resolved" | "rejected";
  createdAt: string;
  reviewedAt: string | null;
};

type SupportResponse = {
  purchases: SupportPurchase[];
  reports: SupportReport[];
  error?: string;
};

export function SupportCenter() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [purchases, setPurchases] = useState<SupportPurchase[]>([]);
  const [reports, setReports] = useState<SupportReport[]>([]);
  const [subject, setSubject] = useState<SupportSubject>("platform_assistance");
  const [selectedPurchaseId, setSelectedPurchaseId] = useState("");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();

    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadSupportData = useCallback(async () => {
    const token = await getAccessToken();

    setLoading(true);
    setError(null);

    if (!token) {
      setError("Sessione non disponibile. Effettua di nuovo il login.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/support/reports", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json()) as SupportResponse;

    if (!response.ok) {
      setError(payload.error ?? "Non sono riuscito a caricare l'assistenza.");
      setLoading(false);
      return;
    }

    setPurchases(payload.purchases ?? []);
    setReports(payload.reports ?? []);
    setSelectedPurchaseId((current) => current || payload.purchases?.[0]?.id || "");
    setLoading(false);
  }, [getAccessToken]);

  useEffect(() => {
    void loadSupportData();
  }, [loadSupportData]);

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (subject === "purchased_lead_assistance" && !selectedPurchaseId) {
      setError("Seleziona il lead acquistato a cui si riferisce la richiesta.");
      return;
    }

    if (details.trim().length < 12) {
      setError("Inserisci una richiesta di almeno 12 caratteri.");
      return;
    }

    const token = await getAccessToken();

    if (!token) {
      setError("Sessione non disponibile. Effettua di nuovo il login.");
      return;
    }

    setSubmitting(true);

    const response = await fetch("/api/support/reports", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject,
        ...(subject === "purchased_lead_assistance"
          ? { leadPurchaseId: selectedPurchaseId }
          : {}),
        details,
      }),
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Non sono riuscito a inviare la segnalazione.");
      setSubmitting(false);
      return;
    }

    setDetails("");
    setSubject("platform_assistance");
    setSuccess("Richiesta inviata. Il team la prenderà in carico.");
    await loadSupportData();
    setSubmitting(false);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <section className="card p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-green/10 text-green">
            <LifeBuoy size={22} />
          </span>
          <div>
            <p className="section-kicker">Assistenza</p>
            <h2 className="text-xl font-semibold text-ink">Come possiamo aiutarti?</h2>
          </div>
        </div>

        <p className="mt-4 leading-7 text-muted">
          Invia una richiesta di assistenza tecnica, chiedi informazioni sulla
          piattaforma oppure ricevi supporto su un lead che hai acquistato.
        </p>

        {loading ? (
          <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm font-semibold text-muted">
            Carico assistenza...
          </div>
        ) : (
          <form className="mt-6 grid gap-4" onSubmit={submitReport}>
            <label className="grid gap-2 text-sm font-semibold text-ink">
              Oggetto della richiesta
              <select
                className="filter-select"
                value={subject}
                onChange={(event) => setSubject(event.target.value as SupportSubject)}
              >
                {supportSubjectOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {subject === "purchased_lead_assistance" ? (
              <label className="grid gap-2 text-sm font-semibold text-ink">
                Lead acquistato
                {purchases.length > 0 ? (
                  <select
                    className="filter-select"
                    value={selectedPurchaseId}
                    onChange={(event) => setSelectedPurchaseId(event.target.value)}
                  >
                    <option value="">Seleziona un lead</option>
                    {purchases.map((purchase) => (
                      <option key={purchase.id} value={purchase.id}>
                        {purchase.leadTitle} -{" "}
                        {purchase.mode === "exclusive" ? "Esclusiva" : "Condiviso"}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-muted">
                    Non hai ancora acquistato lead.
                  </span>
                )}
              </label>
            ) : null}

            <label className="grid gap-2 text-sm font-semibold text-ink">
              Descrivi la tua richiesta
              <textarea
                className="min-h-36 rounded-lg border border-ink/12 bg-white px-4 py-3 leading-7 outline-none transition focus:border-green"
                maxLength={1200}
                placeholder="Scrivi qui come possiamo aiutarti..."
                value={details}
                onChange={(event) => setDetails(event.target.value)}
              />
            </label>

            {error ? (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                <AlertTriangle size={17} className="mt-0.5 shrink-0" />
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="flex items-start gap-2 rounded-xl border border-green/20 bg-green/10 p-3 text-sm font-semibold text-green">
                <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
                {success}
              </div>
            ) : null}

            <button className="btn btn-primary" type="submit" disabled={submitting}>
              <Send size={17} />
              {submitting ? "Invio in corso..." : "Invia richiesta"}
            </button>
          </form>
        )}
      </section>

      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="section-kicker">Storico</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">
              Richieste inviate
            </h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {reports.length} ticket
          </span>
        </div>

        <div className="mt-5 grid gap-3">
          {loading ? (
            <p className="rounded-lg bg-slate-50 p-4 text-sm font-semibold text-muted">
              Carico storico...
            </p>
          ) : reports.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <p className="font-semibold text-ink">Nessuna richiesta ancora</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                Qui troverai stato e storico dei ticket inviati.
              </p>
            </div>
          ) : (
            reports.map((report) => (
              <article
                key={report.id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">
                      {report.leadTitle ?? getSupportSubjectLabel(report.subject)}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {getSupportSubjectLabel(report.subject)} · {formatDateTime(report.createdAt)}
                    </p>
                  </div>
                  <span className={statusBadgeClassName(report.status)}>
                    <Clock3 size={14} />
                    {getReportStatusLabel(report.status)}
                  </span>
                </div>
                {report.details ? (
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted">
                    {report.details}
                  </p>
                ) : null}
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function statusBadgeClassName(status: SupportReport["status"]) {
  const base =
    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold";

  if (status === "resolved") return `${base} bg-green/10 text-green`;
  if (status === "rejected") return `${base} bg-red-50 text-red-700`;
  if (status === "reviewing") return `${base} bg-blue-50 text-blue-700`;

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
