"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  ExternalLink,
  MailCheck,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  TriangleAlert,
  Users,
  Webhook,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

type BrevoTab = "overview" | "consents" | "queue";
type ConsentStatus = "granted" | "not_granted" | "withdrawn";
type OutboxStatus =
  | "pending"
  | "processing"
  | "retry"
  | "completed"
  | "dead_letter"
  | "cancelled";

type ConsentRecord = {
  profileId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  accountStatus: string;
  registeredAt: string | null;
  consentStatus: ConsentStatus;
  source: string;
  policyVersion: string;
  grantedAt: string | null;
  withdrawnAt: string | null;
  updatedAt: string;
};

type OutboxRow = {
  id: string;
  profile_id: string;
  event_type: string;
  event_key: string;
  status: OutboxStatus;
  attempts: number;
  available_at: string;
  last_error: string | null;
  last_http_status: number | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
};

type BrevoOverview = {
  generatedAt: string;
  environment: {
    enabled: boolean;
    reason: "disabled" | "missing_configuration" | null;
    apiKeyConfigured: boolean;
    listIdConfigured: boolean;
    listId: number | null;
    webhookSecretConfigured: boolean;
  };
  stats: {
    propertyManagers: number;
    consentGranted: number;
    consentNotGranted: number;
    consentWithdrawn: number;
    snapshots: number;
    outboxTotal: number;
    pending: number;
    retry: number;
    processing: number;
    completed: number;
    deadLetter: number;
  };
  consentRecords: ConsentRecord[];
  outbox: OutboxRow[];
  attributes: string[];
  error?: string;
};

type BrevoActionResponse = {
  ok?: boolean;
  queuedProfiles?: number;
  requeued?: number;
  worker?: {
    enabled: boolean;
    claimed: number;
    completed: number;
    retried: number;
    deadLettered: number;
    reason?: string;
  };
  error?: string;
};

const tabs: Array<{ id: BrevoTab; label: string }> = [
  { id: "overview", label: "Panoramica" },
  { id: "consents", label: "Consensi" },
  { id: "queue", label: "Coda e diagnostica" },
];

export function AdminBrevoConsole() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [activeTab, setActiveTab] = useState<BrevoTab>("overview");
  const [payload, setPayload] = useState<BrevoOverview | null>(null);
  const [search, setSearch] = useState("");
  const [consentFilter, setConsentFilter] = useState<"all" | ConsentStatus>(
    "all",
  );
  const [queueFilter, setQueueFilter] = useState<"all" | OutboxStatus>("all");
  const [loading, setLoading] = useState(true);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadOverview = useCallback(async () => {
    const token = await getAccessToken();
    setLoading(true);
    setError("");

    if (!token) {
      setError("Sessione admin non trovata.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/admin/brevo/overview", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const nextPayload = (await response.json()) as BrevoOverview;

    if (!response.ok) {
      setError(nextPayload.error ?? "Non riesco a caricare i dati Brevo.");
      setLoading(false);
      return;
    }

    setPayload(nextPayload);
    setLoading(false);
  }, [getAccessToken]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadOverview(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadOverview]);

  async function runAction(
    action: "process" | "reconcile" | "requeue",
    ids?: string[],
  ) {
    const token = await getAccessToken();
    const actionKey =
      action === "requeue" && ids?.length ? `requeue:${ids[0]}` : action;
    setRunningAction(actionKey);
    setError("");
    setSuccess("");

    if (!token) {
      setError("Sessione admin non trovata.");
      setRunningAction(null);
      return;
    }

    const response = await fetch("/api/admin/brevo/outbox", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        action === "requeue"
          ? { action, ids }
          : action === "process"
            ? { action, batchSize: 100 }
            : { action },
      ),
    });
    const result = (await response.json()) as BrevoActionResponse;

    if (!response.ok) {
      setError(result.error ?? "Operazione Brevo non riuscita.");
      setRunningAction(null);
      return;
    }

    if (action === "reconcile") {
      setSuccess(
        `Riconciliazione avviata per ${result.queuedProfiles ?? 0} Property Manager.`,
      );
    } else if (action === "requeue") {
      setSuccess("Elemento rimesso in coda.");
    } else if (result.worker?.enabled === false) {
      setSuccess("Coda invariata: integrazione Brevo non ancora attiva.");
    } else {
      setSuccess(
        `Coda elaborata: ${result.worker?.completed ?? 0} completati, ${result.worker?.retried ?? 0} da riprovare.`,
      );
    }

    setRunningAction(null);
    await loadOverview();
  }

  const filteredConsents = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return (payload?.consentRecords ?? []).filter((record) => {
      if (
        consentFilter !== "all" &&
        record.consentStatus !== consentFilter
      ) {
        return false;
      }

      if (!normalizedSearch) return true;
      return [
        record.firstName,
        record.lastName,
        record.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [consentFilter, payload?.consentRecords, search]);

  const filteredQueue = useMemo(
    () =>
      (payload?.outbox ?? []).filter(
        (row) => queueFilter === "all" || row.status === queueFilter,
      ),
    [payload?.outbox, queueFilter],
  );

  if (loading && !payload) {
    return (
      <div className="card flex min-h-48 items-center justify-center p-6">
        <RefreshCw className="animate-spin text-green" size={22} />
        <span className="ml-3 font-semibold text-slate-600">
          Caricamento integrazione Brevo
        </span>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-600">
            Ultimo controllo:{" "}
            {payload ? formatDateTime(payload.generatedAt) : "non disponibile"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            className="btn btn-secondary"
            href="https://app.brevo.com/"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={17} />
            Apri Brevo
          </a>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => void loadOverview()}
            disabled={loading}
          >
            <RefreshCw className={loading ? "animate-spin" : ""} size={17} />
            Aggiorna
          </button>
        </div>
      </div>

      {error ? (
        <div
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"
          role="alert"
        >
          {error}
        </div>
      ) : null}
      {success ? (
        <div
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"
          role="status"
        >
          {success}
        </div>
      ) : null}

      <div className="admin-filter-tabs" aria-label="Sezioni Brevo">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`admin-filter-tab ${
              activeTab === tab.id ? "admin-filter-tab-active" : ""
            }`}
            type="button"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {payload && activeTab === "overview" ? (
        <OverviewTab
          payload={payload}
          runningAction={runningAction}
          onProcess={() => void runAction("process")}
          onReconcile={() => void runAction("reconcile")}
        />
      ) : null}

      {payload && activeTab === "consents" ? (
        <ConsentsTab
          records={filteredConsents}
          search={search}
          setSearch={setSearch}
          filter={consentFilter}
          setFilter={setConsentFilter}
        />
      ) : null}

      {payload && activeTab === "queue" ? (
        <QueueTab
          rows={filteredQueue}
          filter={queueFilter}
          setFilter={setQueueFilter}
          runningAction={runningAction}
          onProcess={() => void runAction("process")}
          onRequeue={(id) => void runAction("requeue", [id])}
        />
      ) : null}
    </div>
  );
}

function OverviewTab({
  payload,
  runningAction,
  onProcess,
  onReconcile,
}: {
  payload: BrevoOverview;
  runningAction: string | null;
  onProcess: () => void;
  onReconcile: () => void;
}) {
  const ready =
    payload.environment.enabled &&
    payload.environment.apiKeyConfigured &&
    payload.environment.listIdConfigured &&
    payload.environment.webhookSecretConfigured;

  return (
    <>
      <div className="admin-kpi-grid">
        <KpiCard
          icon={Users}
          label="Property Manager"
          value={payload.stats.propertyManagers}
        />
        <KpiCard
          icon={MailCheck}
          label="Consensi attivi"
          value={payload.stats.consentGranted}
        />
        <KpiCard
          icon={DatabaseZap}
          label="Contatti elaborati"
          value={payload.stats.snapshots}
        />
        <KpiCard
          icon={Clock3}
          label="In coda"
          value={
            payload.stats.pending +
            payload.stats.retry +
            payload.stats.processing
          }
        />
        <KpiCard
          icon={TriangleAlert}
          label="Errori definitivi"
          value={payload.stats.deadLetter}
          tone={payload.stats.deadLetter > 0 ? "danger" : "default"}
        />
      </div>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="card p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="section-kicker">Collegamento</p>
              <h2 className="mt-2 text-xl font-semibold text-ink">
                Stato integrazione
              </h2>
            </div>
            <StatusPill ok={ready} label={ready ? "Operativa" : "Da completare"} />
          </div>
          <div className="mt-6 divide-y divide-slate-200">
            <ConfigRow
              icon={Activity}
              label="Sincronizzazione"
              ok={payload.environment.enabled}
              value={payload.environment.enabled ? "Attiva" : "Disattiva"}
            />
            <ConfigRow
              icon={ShieldCheck}
              label="API key"
              ok={payload.environment.apiKeyConfigured}
              value={
                payload.environment.apiKeyConfigured
                  ? "Configurata"
                  : "Mancante"
              }
            />
            <ConfigRow
              icon={Users}
              label="Lista Brevo"
              ok={payload.environment.listIdConfigured}
              value={
                payload.environment.listId
                  ? `ID ${payload.environment.listId}`
                  : "Mancante"
              }
            />
            <ConfigRow
              icon={Webhook}
              label="Webhook revoche"
              ok={payload.environment.webhookSecretConfigured}
              value={
                payload.environment.webhookSecretConfigured
                  ? "Protetto"
                  : "Mancante"
              }
            />
          </div>
        </div>

        <div className="card p-5 sm:p-6">
          <p className="section-kicker">Operazioni</p>
          <h2 className="mt-2 text-xl font-semibold text-ink">
            Sincronizzazione contatti
          </h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              className="btn btn-primary min-h-12"
              type="button"
              onClick={onReconcile}
              disabled={Boolean(runningAction)}
            >
              <RotateCcw
                className={runningAction === "reconcile" ? "animate-spin" : ""}
                size={18}
              />
              Sincronizza tutti i PM
            </button>
            <button
              className="btn btn-secondary min-h-12"
              type="button"
              onClick={onProcess}
              disabled={Boolean(runningAction)}
            >
              <DatabaseZap
                className={runningAction === "process" ? "animate-pulse" : ""}
                size={18}
              />
              Elabora coda
            </button>
          </div>
          <div className="mt-6 border-t border-slate-200 pt-5">
            <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
              <Metric label="Completati" value={payload.stats.completed} />
              <Metric label="Da elaborare" value={payload.stats.pending} />
              <Metric label="Retry" value={payload.stats.retry} />
              <Metric label="In corso" value={payload.stats.processing} />
            </div>
          </div>
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <p className="section-kicker">Mappatura</p>
        <h2 className="mt-2 text-xl font-semibold text-ink">
          Attributi contatto
        </h2>
        <div className="mt-5 flex flex-wrap gap-2">
          {payload.attributes.map((attribute) => (
            <span
              key={attribute}
              className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs font-semibold text-slate-600"
            >
              {attribute}
            </span>
          ))}
        </div>
      </section>
    </>
  );
}

function ConsentsTab({
  records,
  search,
  setSearch,
  filter,
  setFilter,
}: {
  records: ConsentRecord[];
  search: string;
  setSearch: (value: string) => void;
  filter: "all" | ConsentStatus;
  setFilter: (value: "all" | ConsentStatus) => void;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-slate-200 p-5 sm:p-6">
        <p className="section-kicker">Preferenze marketing</p>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-xl font-semibold text-ink">
            Consensi Property Manager
          </h2>
          <div className="admin-filter-tabs">
            {[
              ["all", "Tutti"],
              ["granted", "Attivi"],
              ["not_granted", "Non prestati"],
              ["withdrawn", "Revocati"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={`admin-filter-tab ${
                  filter === id ? "admin-filter-tab-active" : ""
                }`}
                type="button"
                onClick={() => setFilter(id as "all" | ConsentStatus)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="relative mt-4 block">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <span className="sr-only">Cerca Property Manager</span>
          <input
            className="filter-select w-full pl-11"
            type="search"
            placeholder="Cerca per nome o email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>

      <div className="divide-y divide-slate-200">
        {records.map((record) => (
          <div
            key={record.profileId}
            className="grid gap-4 p-5 sm:p-6 lg:grid-cols-[1.35fr_0.7fr_0.9fr_0.75fr] lg:items-center"
          >
            <div className="min-w-0">
              <p className="font-semibold text-ink">
                {[record.firstName, record.lastName].filter(Boolean).join(" ") ||
                  "Nome non indicato"}
              </p>
              <p className="mt-1 break-all text-sm text-slate-500">
                {record.email}
              </p>
            </div>
            <ConsentPill status={record.consentStatus} />
            <div>
              <p className="text-xs font-bold uppercase text-slate-400">
                Origine
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                {formatSource(record.source)}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-400">
                Aggiornato
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                {formatDateTime(record.updatedAt)}
              </p>
            </div>
          </div>
        ))}
        {records.length === 0 ? (
          <div className="p-8 text-center text-sm font-semibold text-slate-500">
            Nessun consenso corrisponde ai filtri selezionati.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function QueueTab({
  rows,
  filter,
  setFilter,
  runningAction,
  onProcess,
  onRequeue,
}: {
  rows: OutboxRow[];
  filter: "all" | OutboxStatus;
  setFilter: (value: "all" | OutboxStatus) => void;
  runningAction: string | null;
  onProcess: () => void;
  onRequeue: (id: string) => void;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-slate-200 p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="section-kicker">Outbox</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">
              Coda sincronizzazione
            </h2>
          </div>
          <button
            className="btn btn-primary"
            type="button"
            onClick={onProcess}
            disabled={Boolean(runningAction)}
          >
            <DatabaseZap
              className={runningAction === "process" ? "animate-pulse" : ""}
              size={17}
            />
            Elabora coda
          </button>
        </div>
        <div className="admin-filter-tabs mt-5">
          {[
            ["all", "Tutti"],
            ["pending", "In attesa"],
            ["retry", "Retry"],
            ["completed", "Completati"],
            ["dead_letter", "Errori"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={`admin-filter-tab ${
                filter === id ? "admin-filter-tab-active" : ""
              }`}
              type="button"
              onClick={() => setFilter(id as "all" | OutboxStatus)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="divide-y divide-slate-200">
        {rows.map((row) => (
          <div
            key={row.id}
            className="grid gap-4 p-5 sm:p-6 lg:grid-cols-[1.1fr_0.65fr_0.65fr_1.25fr_auto] lg:items-center"
          >
            <div className="min-w-0">
              <p className="font-semibold text-ink">
                {formatEventType(row.event_type)}
              </p>
              <p className="mt-1 truncate text-xs text-slate-400">
                {row.event_key}
              </p>
            </div>
            <QueuePill status={row.status} />
            <div>
              <p className="text-xs font-bold uppercase text-slate-400">
                Tentativi
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                {row.attempts}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase text-slate-400">
                Ultimo aggiornamento
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                {formatDateTime(row.updated_at)}
              </p>
              {row.last_error ? (
                <p className="mt-1 line-clamp-2 text-xs text-red-600">
                  {row.last_error}
                </p>
              ) : null}
            </div>
            {row.status === "dead_letter" ? (
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => onRequeue(row.id)}
                disabled={Boolean(runningAction)}
                title="Rimetti in coda"
              >
                <RotateCcw
                  className={
                    runningAction === `requeue:${row.id}` ? "animate-spin" : ""
                  }
                  size={17}
                />
                Riprova
              </button>
            ) : null}
          </div>
        ))}
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm font-semibold text-slate-500">
            Nessun elemento corrisponde al filtro selezionato.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof Users;
  label: string;
  value: number;
  tone?: "default" | "danger";
}) {
  return (
    <div
      className={`card p-5 ${
        tone === "danger" ? "border-red-200 bg-red-50" : ""
      }`}
    >
      <Icon
        className={tone === "danger" ? "text-red-600" : "text-green"}
        size={20}
      />
      <p className="mt-4 text-xs font-bold uppercase text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function ConfigRow({
  icon: Icon,
  label,
  value,
  ok,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
        <Icon size={17} />
      </span>
      <span className="min-w-0 flex-1 font-semibold text-slate-600">{label}</span>
      <span
        className={`text-sm font-bold ${
          ok ? "text-emerald-700" : "text-red-600"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${
        ok
          ? "bg-emerald-100 text-emerald-800"
          : "bg-amber-100 text-amber-800"
      }`}
    >
      {ok ? <CheckCircle2 size={14} /> : <TriangleAlert size={14} />}
      {label}
    </span>
  );
}

function ConsentPill({ status }: { status: ConsentStatus }) {
  const styles = {
    granted: "bg-emerald-100 text-emerald-800",
    not_granted: "bg-slate-100 text-slate-600",
    withdrawn: "bg-red-100 text-red-700",
  };
  const labels = {
    granted: "Consenso attivo",
    not_granted: "Non prestato",
    withdrawn: "Revocato",
  };

  return (
    <span
      className={`inline-flex w-fit items-center rounded-full px-3 py-1.5 text-xs font-bold ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function QueuePill({ status }: { status: OutboxStatus }) {
  const labels: Record<OutboxStatus, string> = {
    pending: "In attesa",
    processing: "In corso",
    retry: "Retry",
    completed: "Completato",
    dead_letter: "Errore",
    cancelled: "Annullato",
  };
  const style =
    status === "completed"
      ? "bg-emerald-100 text-emerald-800"
      : status === "dead_letter"
        ? "bg-red-100 text-red-700"
        : status === "retry"
          ? "bg-amber-100 text-amber-800"
          : "bg-slate-100 text-slate-600";

  return (
    <span
      className={`inline-flex w-fit rounded-full px-3 py-1.5 text-xs font-bold ${style}`}
    >
      {labels[status]}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatSource(source: string) {
  const labels: Record<string, string> = {
    pm_signup: "Registrazione",
    pm_profile_explicit: "Profilo PM",
    brevo_unsubscribe_webhook: "Revoca Brevo",
    historical_backfill: "Importazione iniziale",
  };
  return labels[source] ?? source.replaceAll("_", " ");
}

function formatEventType(eventType: string) {
  const labels: Record<string, string> = {
    contact_sync: "Sincronizzazione contatto",
    user_registered: "Nuova registrazione",
    first_wallet_topup: "Prima ricarica wallet",
    wallet_recharged: "Ricarica wallet",
    first_lead_purchased: "Primo lead acquistato",
    lead_purchased: "Lead acquistato",
    wallet_refunded: "Riaccredito wallet",
    account_suspended: "Account sospeso",
  };
  return labels[eventType] ?? eventType.replaceAll("_", " ");
}
