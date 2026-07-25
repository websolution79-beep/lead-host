"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleOff,
  Code2,
  Database,
  Facebook,
  Flame,
  RefreshCw,
  Save,
  Search,
  Settings2,
  TestTube2,
  XCircle,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import {
  trackingEventIds,
  trackingProviderIds,
  type TrackingEventDefinition,
  type TrackingEventId,
  type TrackingProviderId,
  type TrackingSettings,
} from "@/lib/config/tracking-settings";
import {
  providerConsentRequirements,
  type TrackingConsentState,
} from "@/lib/tracking/consent";
import { useTrackingConsent } from "@/lib/tracking/use-tracking-consent";

type TrackingTab = "providers" | "events" | "logs" | "test";
type LogStatus = "queued" | "sent" | "failed" | "skipped";

type TrackingLog = {
  id: string;
  provider: TrackingProviderId;
  event_name: TrackingEventId;
  event_id: string | null;
  source: string;
  status: LogStatus;
  page_path: string | null;
  value_cents: number | null;
  currency: string | null;
  error_message: string | null;
  occurred_at: string;
  sent_at: string | null;
  created_at: string;
};

type TrackingResponse = {
  settings: TrackingSettings;
  storageReady: boolean;
  eventCatalog: TrackingEventDefinition[];
  environment: {
    metaConversionsApiConfigured: boolean;
    metaGraphApiVersion: string;
    ga4MeasurementProtocolConfigured: boolean;
  };
  error?: string;
};

type LogsResponse = {
  records: TrackingLog[];
  total: number;
  limit: number;
  offset: number;
  error?: string;
};

const providerDetails = {
  meta: {
    label: "Meta Pixel",
    description: "Misurazione campagne Meta e conversioni.",
    identifierLabel: "Pixel ID",
    identifierKey: "pixelId",
    placeholder: "Es. 123456789012345",
    icon: Facebook,
  },
  ga4: {
    label: "Google Analytics 4",
    description: "Analisi traffico, percorsi e conversioni.",
    identifierLabel: "Measurement ID",
    identifierKey: "measurementId",
    placeholder: "Es. G-ABC1234567",
    icon: BarChart3,
  },
  hotjar: {
    label: "Hotjar",
    description: "Mappe di calore e registrazioni delle sessioni.",
    identifierLabel: "Site ID",
    identifierKey: "siteId",
    placeholder: "Es. 1234567",
    icon: Flame,
  },
} as const;

const sourceLabels = {
  browser: "Browser",
  server: "Server",
  hybrid: "Browser + server",
} as const;

const tabs: Array<{
  id: TrackingTab;
  label: string;
  icon: typeof Settings2;
}> = [
  { id: "providers", label: "Provider", icon: Settings2 },
  { id: "events", label: "Eventi", icon: Activity },
  { id: "logs", label: "Registro", icon: Database },
  { id: "test", label: "Test", icon: TestTube2 },
];

export function AdminTrackingConsole() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const consent = useTrackingConsent();
  const [activeTab, setActiveTab] = useState<TrackingTab>("providers");
  const [settings, setSettings] = useState<TrackingSettings | null>(null);
  const [eventCatalog, setEventCatalog] = useState<TrackingEventDefinition[]>([]);
  const [environment, setEnvironment] = useState({
    metaConversionsApiConfigured: false,
    metaGraphApiVersion: "v25.0",
    ga4MeasurementProtocolConfigured: false,
  });
  const [storageReady, setStorageReady] = useState(false);
  const [logs, setLogs] = useState<TrackingLog[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logOffset, setLogOffset] = useState(0);
  const [providerFilter, setProviderFilter] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadConfiguration = useCallback(async () => {
    const token = await getAccessToken();
    setLoading(true);
    setError("");

    if (!token) {
      setError("Sessione admin non trovata.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/admin/tracking", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json()) as TrackingResponse;

    if (!response.ok) {
      setError(payload.error ?? "Non riesco a caricare le impostazioni tracking.");
      setLoading(false);
      return;
    }

    setSettings(payload.settings);
    setEventCatalog(payload.eventCatalog);
    setEnvironment(payload.environment);
    setStorageReady(payload.storageReady);
    setLoading(false);
  }, [getAccessToken]);

  const loadLogs = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      setError("Sessione admin non trovata.");
      return;
    }

    setLogsLoading(true);
    const params = new URLSearchParams({
      limit: "30",
      offset: String(logOffset),
    });
    if (providerFilter) params.set("provider", providerFilter);
    if (eventFilter) params.set("event", eventFilter);
    if (statusFilter) params.set("status", statusFilter);

    const response = await fetch(`/api/admin/tracking/logs?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json()) as LogsResponse;

    if (!response.ok) {
      setError(payload.error ?? "Non riesco a caricare il registro tracking.");
      setLogsLoading(false);
      return;
    }

    setLogs(payload.records);
    setLogTotal(payload.total);
    setLogsLoading(false);
  }, [
    eventFilter,
    getAccessToken,
    logOffset,
    providerFilter,
    statusFilter,
  ]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadConfiguration(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadConfiguration]);

  useEffect(() => {
    if (activeTab !== "logs" || !storageReady) return;
    const timeoutId = window.setTimeout(() => void loadLogs(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [activeTab, loadLogs, storageReady]);

  async function saveConfiguration() {
    if (!settings) return;
    const token = await getAccessToken();
    setSaving(true);
    setError("");
    setSuccess("");

    if (!token) {
      setError("Sessione admin non trovata.");
      setSaving(false);
      return;
    }

    const response = await fetch("/api/admin/tracking", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(settings),
    });
    const payload = (await response.json()) as {
      settings?: TrackingSettings;
      error?: string;
    };

    if (!response.ok || !payload.settings) {
      setError(payload.error ?? "Non sono riuscito a salvare la configurazione.");
      setSaving(false);
      return;
    }

    setSettings(payload.settings);
    setSuccess("Configurazione tracking aggiornata con successo.");
    setSaving(false);
  }

  const activeProviders = settings
    ? trackingProviderIds.filter((provider) => settings.providers[provider].enabled)
        .length
    : 0;
  const configuredProviders = settings
    ? trackingProviderIds.filter((provider) =>
        getProviderIdentifier(settings, provider),
      ).length
    : 0;
  const activeEvents = settings
    ? trackingEventIds.filter((eventId) => settings.events[eventId].enabled).length
    : 0;
  const failedLogs = logs.filter((log) => log.status === "failed").length;

  if (loading || !settings) {
    return (
      <section className="card flex min-h-72 items-center justify-center p-6">
        <div className="text-center">
          <RefreshCw className="mx-auto animate-spin text-green" size={24} />
          <p className="mt-3 text-sm font-semibold text-muted">
            Caricamento configurazione tracking...
          </p>
        </div>
      </section>
    );
  }

  return (
    <div className="grid gap-6">
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="section-kicker">Centro di controllo</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">
              Provider ed eventi
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              Configura gli strumenti di misurazione, scegli gli eventi da
              tracciare e controlla gli invii dal registro.
            </p>
          </div>
          {(activeTab === "providers" || activeTab === "events") && (
            <button
              className="btn btn-primary"
              type="button"
              disabled={saving || !storageReady}
              onClick={() => void saveConfiguration()}
            >
              <Save size={17} />
              {saving ? "Salvataggio..." : "Salva configurazione"}
            </button>
          )}
        </div>

        {!storageReady ? (
          <StatusBox
            tone="error"
            text="Archivio tracking non disponibile. Verifica la migration Supabase."
          />
        ) : null}
        {error ? <StatusBox tone="error" text={error} /> : null}
        {success ? <StatusBox tone="success" text={success} /> : null}
      </section>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Provider attivi" value={`${activeProviders}/3`} />
        <MetricCard label="Provider configurati" value={`${configuredProviders}/3`} />
        <MetricCard label="Eventi attivi" value={`${activeEvents}/8`} />
        <MetricCard label="Errori nel registro" value={String(failedLogs)} />
      </section>

      <div
        className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-2 md:grid-cols-4"
        role="tablist"
        aria-label="Sezioni tracking"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition ${
                selected
                  ? "bg-green text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-ink"
              }`}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                setActiveTab(tab.id);
                setError("");
                setSuccess("");
              }}
            >
              <Icon size={17} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "providers" ? (
        <ProvidersTab settings={settings} setSettings={setSettings} />
      ) : null}
      {activeTab === "events" ? (
        <EventsTab
          settings={settings}
          setSettings={setSettings}
          eventCatalog={eventCatalog}
        />
      ) : null}
      {activeTab === "logs" ? (
        <LogsTab
          logs={logs}
          total={logTotal}
          offset={logOffset}
          loading={logsLoading}
          providerFilter={providerFilter}
          eventFilter={eventFilter}
          statusFilter={statusFilter}
          eventCatalog={eventCatalog}
          setOffset={setLogOffset}
          setProviderFilter={(value) => {
            setProviderFilter(value);
            setLogOffset(0);
          }}
          setEventFilter={(value) => {
            setEventFilter(value);
            setLogOffset(0);
          }}
          setStatusFilter={(value) => {
            setStatusFilter(value);
            setLogOffset(0);
          }}
          refresh={() => void loadLogs()}
        />
      ) : null}
      {activeTab === "test" ? (
        <TestTab
          settings={settings}
          storageReady={storageReady}
          environment={environment}
          consent={consent}
          refresh={() => void loadConfiguration()}
        />
      ) : null}
    </div>
  );
}

function ProvidersTab({
  settings,
  setSettings,
}: {
  settings: TrackingSettings;
  setSettings: React.Dispatch<React.SetStateAction<TrackingSettings | null>>;
}) {
  return (
    <section className="grid gap-4">
      {trackingProviderIds.map((providerId) => {
        const details = providerDetails[providerId];
        const provider = settings.providers[providerId];
        const identifier = getProviderIdentifier(settings, providerId);
        const Icon = details.icon;
        return (
          <article key={providerId} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                  <Icon size={21} />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-ink">
                      {details.label}
                    </h3>
                    <ProviderStatus
                      enabled={provider.enabled}
                      configured={Boolean(identifier)}
                    />
                    <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                      Consenso {providerConsentRequirements[providerId].label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{details.description}</p>
                </div>
              </div>
              <Toggle
                checked={provider.enabled}
                label={`Attiva ${details.label}`}
                onChange={(checked) =>
                  setSettings((current) =>
                    current
                      ? {
                          ...current,
                          providers: {
                            ...current.providers,
                            [providerId]: {
                              ...current.providers[providerId],
                              enabled: checked,
                            },
                          },
                        }
                      : current,
                  )
                }
              />
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(260px,420px)_1fr]">
              <label className="grid gap-2 text-sm font-semibold text-ink">
                {details.identifierLabel}
                <input
                  className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 outline-none focus:border-green"
                  value={identifier}
                  placeholder={details.placeholder}
                  inputMode={providerId === "ga4" ? "text" : "numeric"}
                  onChange={(event) =>
                    updateProviderIdentifier(
                      setSettings,
                      providerId,
                      event.target.value.trim(),
                    )
                  }
                />
              </label>

              <fieldset>
                <legend className="text-sm font-semibold text-ink">
                  Aree consentite
                </legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {(
                    [
                      ["public", "Pagine pubbliche"],
                      ["pm", "Area PM"],
                      ["admin", "Area admin"],
                    ] as const
                  ).map(([scope, label]) => (
                    <label
                      key={scope}
                      className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={provider.scopes[scope]}
                        onChange={(event) =>
                          setSettings((current) =>
                            current
                              ? {
                                  ...current,
                                  providers: {
                                    ...current.providers,
                                    [providerId]: {
                                      ...current.providers[providerId],
                                      scopes: {
                                        ...current.providers[providerId].scopes,
                                        [scope]: event.target.checked,
                                      },
                                    },
                                  },
                                }
                              : current,
                          )
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function EventsTab({
  settings,
  setSettings,
  eventCatalog,
}: {
  settings: TrackingSettings;
  setSettings: React.Dispatch<React.SetStateAction<TrackingSettings | null>>;
  eventCatalog: TrackingEventDefinition[];
}) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-slate-200 p-5">
        <p className="section-kicker">Matrice eventi</p>
        <h2 className="mt-2 text-xl font-semibold text-ink">
          Eventi disponibili
        </h2>
      </div>
      <div className="divide-y divide-slate-100">
        {eventCatalog.map((definition) => {
          const event = settings.events[definition.id];
          return (
            <article
              key={definition.id}
              className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_260px_130px]"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-ink">{definition.label}</h3>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {sourceLabels[definition.source]}
                  </span>
                  {definition.metaEventName ? (
                    <code className="rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                      {definition.metaEventName}
                    </code>
                  ) : null}
                </div>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {definition.description}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Trigger: {definition.trigger}
                </p>
              </div>

              <fieldset>
                <legend className="text-xs font-semibold uppercase text-muted">
                  Provider
                </legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {trackingProviderIds.map((providerId) => {
                    const checked = event.providers.includes(providerId);
                    return (
                      <label
                        key={providerId}
                        className={`flex min-h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold ${
                          checked
                            ? "border-green/30 bg-green/8 text-green"
                            : "border-slate-200 text-slate-500"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(changeEvent) =>
                            setSettings((current) => {
                              if (!current) return current;
                              const providers = changeEvent.target.checked
                                ? [...current.events[definition.id].providers, providerId]
                                : current.events[definition.id].providers.filter(
                                    (currentProvider) =>
                                      currentProvider !== providerId,
                                  );
                              return {
                                ...current,
                                events: {
                                  ...current.events,
                                  [definition.id]: {
                                    ...current.events[definition.id],
                                    providers,
                                  },
                                },
                              };
                            })
                          }
                        />
                        {providerDetails[providerId].label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="flex items-start justify-between gap-3 xl:justify-end">
                <span className="text-sm font-semibold text-slate-600 xl:hidden">
                  Evento attivo
                </span>
                <Toggle
                  checked={event.enabled}
                  label={`Attiva ${definition.label}`}
                  onChange={(checked) =>
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            events: {
                              ...current.events,
                              [definition.id]: {
                                ...current.events[definition.id],
                                enabled: checked,
                              },
                            },
                          }
                        : current,
                    )
                  }
                />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function LogsTab({
  logs,
  total,
  offset,
  loading,
  providerFilter,
  eventFilter,
  statusFilter,
  eventCatalog,
  setOffset,
  setProviderFilter,
  setEventFilter,
  setStatusFilter,
  refresh,
}: {
  logs: TrackingLog[];
  total: number;
  offset: number;
  loading: boolean;
  providerFilter: string;
  eventFilter: string;
  statusFilter: string;
  eventCatalog: TrackingEventDefinition[];
  setOffset: (value: number) => void;
  setProviderFilter: (value: string) => void;
  setEventFilter: (value: string) => void;
  setStatusFilter: (value: string) => void;
  refresh: () => void;
}) {
  const limit = 30;
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-slate-200 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="section-kicker">Audit</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">
              Registro eventi
            </h2>
          </div>
          <button
            className="btn btn-secondary"
            type="button"
            disabled={loading}
            onClick={refresh}
          >
            <RefreshCw size={17} className={loading ? "animate-spin" : ""} />
            Aggiorna
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <FilterSelect
            icon={Search}
            value={providerFilter}
            label="Provider"
            onChange={setProviderFilter}
            options={trackingProviderIds.map((id) => ({
              value: id,
              label: providerDetails[id].label,
            }))}
          />
          <FilterSelect
            icon={Activity}
            value={eventFilter}
            label="Evento"
            onChange={setEventFilter}
            options={eventCatalog.map((event) => ({
              value: event.id,
              label: event.label,
            }))}
          />
          <FilterSelect
            icon={CheckCircle2}
            value={statusFilter}
            label="Stato"
            onChange={setStatusFilter}
            options={[
              { value: "queued", label: "In coda" },
              { value: "sent", label: "Inviato" },
              { value: "failed", label: "Errore" },
              { value: "skipped", label: "Saltato" },
            ]}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-48 items-center justify-center">
          <RefreshCw className="animate-spin text-green" size={22} />
        </div>
      ) : logs.length ? (
        <div className="divide-y divide-slate-100">
          {logs.map((log) => (
            <article
              key={log.id}
              className="grid gap-3 p-4 lg:grid-cols-[150px_minmax(0,1fr)_180px]"
            >
              <div>
                <LogStatusBadge status={log.status} />
                <p className="mt-2 text-xs font-semibold uppercase text-muted">
                  {providerDetails[log.provider].label}
                </p>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-ink">
                  {eventCatalog.find((event) => event.id === log.event_name)
                    ?.label ?? log.event_name}
                </p>
                <p className="mt-1 break-words text-sm text-muted">
                  {log.page_path ?? log.source}
                  {log.event_id ? ` · ID ${log.event_id}` : ""}
                </p>
                {log.error_message ? (
                  <p className="mt-2 text-sm font-semibold text-red-700">
                    {log.error_message}
                  </p>
                ) : null}
              </div>
              <p className="text-sm text-muted lg:text-right">
                {formatDate(log.sent_at ?? log.occurred_at)}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div className="p-10 text-center">
          <Database className="mx-auto text-slate-300" size={28} />
          <p className="mt-3 font-semibold text-ink">Nessun evento registrato</p>
          <p className="mt-1 text-sm text-muted">
            Il registro si popolerà quando verranno attivate le integrazioni.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4">
        <p className="text-sm text-muted">
          {total ? `${offset + 1}-${Math.min(offset + limit, total)} di ${total}` : "0 risultati"}
        </p>
        <div className="flex gap-2">
          <button
            className="btn btn-secondary"
            type="button"
            aria-label="Pagina precedente"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            aria-label="Pagina successiva"
            disabled={offset + limit >= total || loading}
            onClick={() => setOffset(offset + limit)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
    </section>
  );
}

function TestTab({
  settings,
  storageReady,
  environment,
  consent,
  refresh,
}: {
  settings: TrackingSettings;
  storageReady: boolean;
  environment: TrackingResponse["environment"];
  consent: TrackingConsentState;
  refresh: () => void;
}) {
  const checks = [
    {
      label: "Archivio Supabase",
      value: storageReady ? "Disponibile" : "Non disponibile",
      passed: storageReady,
    },
    {
      label: "Preferenza Iubenda",
      value: consent.resolved
        ? "Preferenza rilevata"
        : "In attesa di una scelta",
      passed: consent.resolved,
    },
    {
      label: "Misurazione (finalità 4)",
      value: consent.measurement ? "Consentita" : "Non consentita",
      passed: consent.measurement,
    },
    {
      label: "Marketing (finalità 5)",
      value: consent.marketing ? "Consentito" : "Non consentito",
      passed: consent.marketing,
    },
    ...[
      { id: "page_view" as const, label: "Meta Page View" },
      {
        id: "telegram_join_click" as const,
        label: "Meta Clic Telegram",
      },
      { id: "lead" as const, label: "Meta Lead" },
      {
        id: "complete_registration" as const,
        label: "Meta Registrazione completata",
      },
      { id: "purchase" as const, label: "Meta Purchase da Stripe" },
    ].map((event) => {
      const isActive =
        settings.events[event.id].enabled &&
        settings.events[event.id].providers.includes("meta");

      return {
        label: event.label,
        value: isActive ? "Evento attivo" : "Evento disattivato",
        passed: isActive,
      };
    }),
    ...[
      { id: "page_view" as const, label: "GA4 Page View" },
      {
        id: "telegram_join_click" as const,
        label: "GA4 Clic Telegram",
      },
      { id: "lead" as const, label: "GA4 Generate Lead" },
      {
        id: "complete_registration" as const,
        label: "GA4 Registrazione completata",
      },
      { id: "purchase" as const, label: "GA4 Purchase da Stripe" },
    ].map((event) => {
      const isActive =
        settings.events[event.id].enabled &&
        settings.events[event.id].providers.includes("ga4");

      return {
        label: event.label,
        value: isActive ? "Evento attivo" : "Evento disattivato",
        passed: isActive,
      };
    }),
    ...[
      { id: "page_view" as const, label: "Hotjar navigazione SPA" },
      {
        id: "telegram_join_click" as const,
        label: "Hotjar Clic Telegram",
      },
      { id: "lead" as const, label: "Hotjar registrazione creata" },
      {
        id: "complete_registration" as const,
        label: "Hotjar registrazione confermata",
      },
    ].map((event) => {
      const isActive =
        settings.events[event.id].enabled &&
        settings.events[event.id].providers.includes("hotjar");

      return {
        label: event.label,
        value: isActive ? "Evento attivo" : "Evento disattivato",
        passed: isActive,
      };
    }),
    ...trackingProviderIds.map((providerId) => {
      const identifier = getProviderIdentifier(settings, providerId);
      return {
        label: providerDetails[providerId].label,
        value: identifier
          ? settings.providers[providerId].enabled
            ? "Configurato e attivo"
            : "Configurato, disattivato"
          : "Identificativo non inserito",
        passed: Boolean(identifier),
      };
    }),
    {
      label: "Meta Conversions API",
      value: environment.metaConversionsApiConfigured
        ? `Token server configurato · ${environment.metaGraphApiVersion}`
        : "Token server non configurato",
      passed: environment.metaConversionsApiConfigured,
    },
    {
      label: "GA4 Measurement Protocol",
      value: environment.ga4MeasurementProtocolConfigured
        ? "Secret server configurato"
        : "Secret server non configurato",
      passed: environment.ga4MeasurementProtocolConfigured,
    },
  ];

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="section-kicker">Diagnostica</p>
          <h2 className="mt-2 text-xl font-semibold text-ink">
            Stato integrazioni
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Controlla configurazione e variabili disponibili senza inviare
            eventi ai provider.
          </p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={refresh}>
          <RefreshCw size={17} />
          Aggiorna test
        </button>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        {checks.map((check) => (
          <div
            key={check.label}
            className="flex min-h-20 items-start gap-3 rounded-lg border border-slate-200 p-4"
          >
            <span
              className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md ${
                check.passed
                  ? "bg-green/10 text-green"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {check.passed ? <Check size={17} /> : <CircleOff size={17} />}
            </span>
            <div>
              <p className="font-semibold text-ink">{check.label}</p>
              <p className="mt-1 text-sm text-muted">{check.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <Code2 className="mt-0.5 shrink-0" size={18} />
        <p>
          In questa fase il test è solo diagnostico: nessun evento viene
          trasmesso a Meta, Google Analytics o Hotjar.
        </p>
      </div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="card min-h-28 p-4">
      <p className="text-xs font-semibold uppercase text-muted">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-ink">{value}</p>
    </article>
  );
}

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${
        checked ? "bg-green" : "bg-slate-300"
      }`}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span
        className={`absolute top-1 size-5 rounded-full bg-white shadow-sm transition ${
          checked ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}

function ProviderStatus({
  enabled,
  configured,
}: {
  enabled: boolean;
  configured: boolean;
}) {
  const label = enabled ? "Attivo" : configured ? "Configurato" : "Da configurare";
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        enabled
          ? "bg-green/10 text-green"
          : configured
            ? "bg-blue-50 text-blue-700"
            : "bg-slate-100 text-slate-600"
      }`}
    >
      {label}
    </span>
  );
}

function FilterSelect({
  icon: Icon,
  value,
  label,
  options,
  onChange,
}: {
  icon: typeof Search;
  value: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative grid gap-1 text-xs font-semibold uppercase text-muted">
      {label}
      <Icon
        className="pointer-events-none absolute bottom-3.5 left-3 text-slate-400"
        size={16}
      />
      <select
        className="min-h-11 rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold normal-case text-ink outline-none focus:border-green"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Tutti</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function LogStatusBadge({ status }: { status: LogStatus }) {
  const details = {
    queued: {
      label: "In coda",
      className: "bg-amber-50 text-amber-800",
      icon: AlertCircle,
    },
    sent: {
      label: "Inviato",
      className: "bg-green/10 text-green",
      icon: CheckCircle2,
    },
    failed: {
      label: "Errore",
      className: "bg-red-50 text-red-700",
      icon: XCircle,
    },
    skipped: {
      label: "Saltato",
      className: "bg-slate-100 text-slate-600",
      icon: CircleOff,
    },
  }[status];
  const Icon = details.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${details.className}`}
    >
      <Icon size={13} />
      {details.label}
    </span>
  );
}

function StatusBox({
  tone,
  text,
}: {
  tone: "success" | "error";
  text: string;
}) {
  return (
    <div
      className={`mt-5 rounded-lg border px-4 py-3 text-sm font-semibold ${
        tone === "success"
          ? "border-green/20 bg-green/8 text-green"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      {text}
    </div>
  );
}

function getProviderIdentifier(
  settings: TrackingSettings,
  providerId: TrackingProviderId,
) {
  if (providerId === "meta") return settings.providers.meta.pixelId;
  if (providerId === "ga4") return settings.providers.ga4.measurementId;
  return settings.providers.hotjar.siteId;
}

function updateProviderIdentifier(
  setSettings: React.Dispatch<React.SetStateAction<TrackingSettings | null>>,
  providerId: TrackingProviderId,
  value: string,
) {
  setSettings((current) => {
    if (!current) return current;
    if (providerId === "meta") {
      return {
        ...current,
        providers: {
          ...current.providers,
          meta: { ...current.providers.meta, pixelId: value },
        },
      };
    }
    if (providerId === "ga4") {
      return {
        ...current,
        providers: {
          ...current.providers,
          ga4: { ...current.providers.ga4, measurementId: value.toUpperCase() },
        },
      };
    }
    return {
      ...current,
      providers: {
        ...current.providers,
        hotjar: { ...current.providers.hotjar, siteId: value },
      },
    };
  });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
