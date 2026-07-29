"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clipboard,
  KeyRound,
  Power,
  RefreshCw,
  ShieldCheck,
  Webhook,
  XCircle,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

type ApiSettings = {
  enabled: boolean;
  configured: boolean;
  tokenPrefix: string | null;
  createdAt: string | null;
  rotatedAt: string | null;
};

type IngestionLog = {
  id: string;
  ownerRequestId: string | null;
  externalId: string | null;
  receivedAt: string;
  processedAt: string | null;
  errorMessage: string | null;
  status: "created" | "failed" | "processing";
};

type ApiConsoleResponse = {
  endpointUrl: string;
  settings: ApiSettings;
  samplePayload: Record<string, unknown>;
  logs: IngestionLog[];
  totalReceived: number;
  logsReady: boolean;
  storageReady: boolean;
  error?: string;
};

const emptySettings: ApiSettings = {
  enabled: false,
  configured: false,
  tokenPrefix: null,
  createdAt: null,
  rotatedAt: null,
};

export function AdminOwnerLeadApiConsole() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [settings, setSettings] = useState<ApiSettings>(emptySettings);
  const [endpointUrl, setEndpointUrl] = useState("");
  const [samplePayload, setSamplePayload] = useState<Record<string, unknown>>(
    {},
  );
  const [logs, setLogs] = useState<IngestionLog[]>([]);
  const [totalReceived, setTotalReceived] = useState(0);
  const [storageReady, setStorageReady] = useState(true);
  const [logsReady, setLogsReady] = useState(true);
  const [generatedSecret, setGeneratedSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<
    "toggle" | "generate" | "rotate" | null
  >(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();

    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadConsole = useCallback(async () => {
    const token = await getAccessToken();
    setLoading(true);
    setError("");

    if (!token) {
      setError("Sessione admin non trovata.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/admin/acquisition/api", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json()) as ApiConsoleResponse;

    if (!response.ok) {
      setError(payload.error ?? "Non riesco a caricare il webhook.");
      setLoading(false);
      return;
    }

    setSettings(payload.settings);
    setEndpointUrl(payload.endpointUrl);
    setSamplePayload(payload.samplePayload);
    setLogs(payload.logs);
    setTotalReceived(payload.totalReceived);
    setStorageReady(payload.storageReady);
    setLogsReady(payload.logsReady);
    setLoading(false);
  }, [getAccessToken]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadConsole(), 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadConsole]);

  async function toggleWebhook() {
    const token = await getAccessToken();
    setWorking("toggle");
    setError("");
    setSuccess("");

    if (!token) {
      setError("Sessione admin non trovata.");
      setWorking(null);
      return;
    }

    const response = await fetch("/api/admin/acquisition/api", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ enabled: !settings.enabled }),
    });
    const payload = (await response.json()) as {
      settings?: ApiSettings;
      error?: string;
    };

    if (!response.ok || !payload.settings) {
      setError(payload.error ?? "Non riesco ad aggiornare il webhook.");
      setWorking(null);
      return;
    }

    setSettings(payload.settings);
    setSuccess(
      payload.settings.enabled
        ? "Webhook attivato. I sistemi autorizzati possono inviare lead."
        : "Webhook disattivato.",
    );
    setWorking(null);
  }

  async function generateSecret(action: "generate_secret" | "rotate_secret") {
    if (
      action === "rotate_secret" &&
      !window.confirm(
        "La chiave attuale smetterà subito di funzionare. Vuoi continuare?",
      )
    ) {
      return;
    }

    const token = await getAccessToken();
    setWorking(action === "generate_secret" ? "generate" : "rotate");
    setError("");
    setSuccess("");
    setGeneratedSecret("");

    if (!token) {
      setError("Sessione admin non trovata.");
      setWorking(null);
      return;
    }

    const response = await fetch("/api/admin/acquisition/api", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action }),
    });
    const payload = (await response.json()) as {
      secret?: string;
      settings?: ApiSettings;
      error?: string;
    };

    if (!response.ok || !payload.secret || !payload.settings) {
      setError(payload.error ?? "Non riesco a generare la chiave.");
      setWorking(null);
      return;
    }

    setGeneratedSecret(payload.secret);
    setSettings(payload.settings);
    setSuccess(
      action === "rotate_secret"
        ? "Nuova chiave generata. Aggiorna Make o Zapier prima del prossimo invio."
        : "Chiave webhook generata.",
    );
    setWorking(null);
  }

  async function copyValue(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setSuccess(`${label} copiato.`);
  }

  if (loading) {
    return (
      <div className="card p-8 text-center text-muted">
        Carico configurazione webhook...
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <p className="section-kicker">Manuale/API</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">
            Webhook lead proprietari
          </h2>
          <p className="mt-3 max-w-3xl leading-7 text-muted">
            Endpoint unico per Make, Zapier e sistemi esterni. Ogni richiesta
            valida crea un lead proprietario in stato pending usando gli stessi
            campi e controlli del modulo Lead Host.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-paper p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-ink">Stato webhook</p>
              <p className="mt-1 text-sm text-muted">
                {settings.enabled ? "Attivo" : "Disattivato"}
              </p>
            </div>
            <span
              className={`rounded-lg p-2 ${
                settings.enabled
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              <Webhook size={18} />
            </span>
          </div>
          <button
            className={`mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold ${
              settings.enabled
                ? "border border-slate-300 bg-white text-slate-800"
                : "bg-green text-white"
            }`}
            type="button"
            disabled={working === "toggle" || !settings.configured}
            onClick={() => void toggleWebhook()}
          >
            <Power size={17} />
            {working === "toggle"
              ? "Salvataggio..."
              : settings.enabled
                ? "Disattiva webhook"
                : "Attiva webhook"}
          </button>
          {!settings.configured ? (
            <p className="mt-3 text-sm leading-6 text-amber-700">
              Genera una chiave prima di attivare il webhook.
            </p>
          ) : null}
        </div>
      </div>

      {error ? <StatusMessage tone="error" text={error} /> : null}
      {success ? <StatusMessage tone="success" text={success} /> : null}
      {!storageReady ? (
        <StatusMessage
          tone="error"
          text="Le impostazioni non sono disponibili nel database."
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <Webhook size={17} className="text-green" />
            Endpoint
          </p>
          <CodeValue
            value={endpointUrl}
            onCopy={() => void copyValue(endpointUrl, "Endpoint")}
          />
          <p className="mt-4 text-xs font-bold uppercase text-slate-500">
            Header di autenticazione
          </p>
          <CodeValue
            value="Authorization: Bearer LA_TUA_CHIAVE"
            onCopy={() =>
              void copyValue(
                "Authorization: Bearer LA_TUA_CHIAVE",
                "Header",
              )
            }
          />
          <p className="mt-4 text-xs font-bold uppercase text-slate-500">
            Metodo e formato
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge text="POST" />
            <Badge text="application/json" />
            <Badge text="Stato finale: pending" />
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <KeyRound size={17} className="text-green" />
            Chiave webhook
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            {settings.configured
              ? `Configurata: ${settings.tokenPrefix}`
              : "Nessuna chiave configurata."}
          </p>
          <div className="mt-4 grid gap-2">
            {!settings.configured ? (
              <button
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-green px-4 text-sm font-bold text-white"
                type="button"
                disabled={working === "generate"}
                onClick={() => void generateSecret("generate_secret")}
              >
                <KeyRound size={17} />
                {working === "generate" ? "Generazione..." : "Genera chiave"}
              </button>
            ) : (
              <button
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800"
                type="button"
                disabled={working === "rotate"}
                onClick={() => void generateSecret("rotate_secret")}
              >
                <RefreshCw size={17} />
                {working === "rotate" ? "Rigenerazione..." : "Rigenera chiave"}
              </button>
            )}
          </div>
        </section>
      </div>

      {generatedSecret ? (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 shrink-0 text-amber-700" size={20} />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-amber-950">
                Copia ora la chiave: non verrà mostrata di nuovo
              </p>
              <CodeValue
                value={generatedSecret}
                onCopy={() =>
                  void copyValue(generatedSecret, "Chiave webhook")
                }
              />
            </div>
          </div>
        </section>
      ) : null}

      <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="section-kicker">Schema</p>
            <h3 className="mt-1 text-lg font-semibold text-ink">
              Payload JSON di esempio
            </h3>
          </div>
          <button
            className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800"
            type="button"
            onClick={() =>
              void copyValue(
                JSON.stringify(samplePayload, null, 2),
                "Payload JSON",
              )
            }
          >
            <Clipboard size={16} />
            Copia JSON
          </button>
        </div>
        <pre className="mt-4 max-h-[520px] min-w-0 max-w-full overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-6 text-slate-100">
          <code>{JSON.stringify(samplePayload, null, 2)}</code>
        </pre>
      </section>

      <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="section-kicker">Monitoraggio</p>
            <h3 className="mt-1 text-lg font-semibold text-ink">
              Importazioni recenti
            </h3>
            <p className="mt-1 text-sm text-muted">
              {totalReceived} richieste API registrate
            </p>
          </div>
          <button
            className="icon-button"
            type="button"
            title="Aggiorna importazioni"
            onClick={() => void loadConsole()}
          >
            <RefreshCw size={17} />
          </button>
        </div>

        {!logsReady ? (
          <StatusMessage
            tone="error"
            text="Non riesco a caricare lo storico delle importazioni."
          />
        ) : logs.length ? (
          <div className="mt-4 grid gap-2">
            {logs.map((log) => (
              <div
                className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                key={log.id}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">
                    {log.externalId ?? "ID esterno non disponibile"}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {formatDateTime(log.receivedAt)}
                    {log.ownerRequestId
                      ? ` · LH-${log.ownerRequestId.slice(0, 8).toUpperCase()}`
                      : ""}
                  </p>
                  {log.errorMessage ? (
                    <p className="mt-1 text-sm text-red-700">
                      {log.errorMessage}
                    </p>
                  ) : null}
                </div>
                <LogStatus status={log.status} />
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-lg bg-paper p-4 text-sm text-muted">
            Nessuna importazione API ricevuta.
          </p>
        )}
      </section>
    </div>
  );
}

function CodeValue({
  value,
  onCopy,
}: {
  value: string;
  onCopy: () => void;
}) {
  return (
    <div className="mt-2 flex min-w-0 items-center gap-2 rounded-lg bg-slate-950 p-3 text-slate-100">
      <code className="min-w-0 flex-1 break-all text-xs font-semibold">
        {value}
      </code>
      <button
        className="shrink-0 rounded-md p-2 text-slate-200 hover:bg-slate-800"
        type="button"
        title="Copia"
        onClick={onCopy}
      >
        <Clipboard size={16} />
      </button>
    </div>
  );
}

function StatusMessage({
  tone,
  text,
}: {
  tone: "success" | "error";
  text: string;
}) {
  return (
    <div
      className={`rounded-lg border p-3 text-sm font-semibold ${
        tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-red-200 bg-red-50 text-red-800"
      }`}
    >
      {text}
    </div>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <span className="rounded-md bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700">
      {text}
    </span>
  );
}

function LogStatus({ status }: { status: IngestionLog["status"] }) {
  const config = {
    created: {
      label: "Creato",
      className: "bg-emerald-100 text-emerald-800",
      icon: CheckCircle2,
    },
    failed: {
      label: "Errore",
      className: "bg-red-100 text-red-800",
      icon: XCircle,
    },
    processing: {
      label: "In elaborazione",
      className: "bg-amber-100 text-amber-800",
      icon: RefreshCw,
    },
  }[status];
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold ${config.className}`}
    >
      <Icon size={14} />
      {config.label}
    </span>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
