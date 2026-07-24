"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  CheckCircle2,
  CircleOff,
  Power,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import type { TelegramChannelSettings } from "@/lib/config/telegram-settings";

type TelegramLog = {
  id: string;
  event_type: string;
  channel_id: string;
  provider_message_id: string | null;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
};

type TelegramConnection = {
  botUsername: string;
  channelTitle: string;
  channelType: string;
  membershipStatus: string;
  canPost: boolean;
};

type TelegramResponse = {
  settings: TelegramChannelSettings;
  environment: {
    botTokenConfigured: boolean;
    channelIdConfigured: boolean;
  };
  logs: TelegramLog[];
  logsReady: boolean;
  storageReady: boolean;
  variables: string[];
  error?: string;
};

export function AdminTelegramConsole() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [settings, setSettings] = useState<TelegramChannelSettings>({
    enabled: false,
    messageTemplate: "",
  });
  const [environment, setEnvironment] = useState({
    botTokenConfigured: false,
    channelIdConfigured: false,
  });
  const [variables, setVariables] = useState<string[]>([]);
  const [logs, setLogs] = useState<TelegramLog[]>([]);
  const [storageReady, setStorageReady] = useState(true);
  const [logsReady, setLogsReady] = useState(true);
  const [connection, setConnection] = useState<TelegramConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAutomation, setSavingAutomation] = useState(false);
  const [testing, setTesting] = useState<"connection" | "message" | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();

    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadSettings = useCallback(async () => {
    const token = await getAccessToken();
    setLoading(true);
    setError("");

    if (!token) {
      setError("Sessione admin non trovata.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/admin/telegram", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json()) as TelegramResponse;

    if (!response.ok) {
      setError(payload.error ?? "Non riesco a caricare la configurazione Telegram.");
      setLoading(false);
      return;
    }

    setSettings(payload.settings);
    setEnvironment(payload.environment);
    setVariables(payload.variables);
    setLogs(payload.logs);
    setStorageReady(payload.storageReady);
    setLogsReady(payload.logsReady);
    setLoading(false);

    if (
      payload.environment.botTokenConfigured &&
      payload.environment.channelIdConfigured
    ) {
      setTesting("connection");
      const connectionResponse = await requestTelegramAction(
        token,
        "check_connection",
      );

      if (connectionResponse.ok) {
        setConnection(connectionResponse.connection ?? null);
      } else {
        setConnection(null);
        setError(
          connectionResponse.error ??
            "Non riesco a verificare automaticamente i permessi del bot.",
        );
      }

      setTesting(null);
    }
  }, [getAccessToken]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadSettings(), 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadSettings]);

  async function saveSettings() {
    const token = await getAccessToken();
    setSaving(true);
    setError("");
    setSuccess("");

    if (!token) {
      setError("Sessione admin non trovata.");
      setSaving(false);
      return;
    }

    const response = await fetch("/api/admin/telegram", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(settings),
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Non sono riuscito a salvare le impostazioni.");
      setSaving(false);
      return;
    }

    setSuccess(
      settings.enabled
        ? "Invii automatici Telegram attivati."
        : "Configurazione salvata. Invii automatici disattivati.",
    );
    setSaving(false);
  }

  async function toggleAutomation() {
    const token = await getAccessToken();
    const nextSettings = {
      ...settings,
      enabled: !settings.enabled,
    };
    setSavingAutomation(true);
    setError("");
    setSuccess("");

    if (!token) {
      setError("Sessione admin non trovata.");
      setSavingAutomation(false);
      return;
    }

    const response = await fetch("/api/admin/telegram", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(nextSettings),
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(
        payload.error ?? "Non sono riuscito ad aggiornare gli invii automatici.",
      );
      setSavingAutomation(false);
      return;
    }

    setSettings(nextSettings);
    setSuccess(
      nextSettings.enabled
        ? "Invii automatici Telegram attivati e salvati."
        : "Invii automatici Telegram disattivati e salvati.",
    );
    setSavingAutomation(false);
  }

  async function runTest(action: "check_connection" | "send_test") {
    const token = await getAccessToken();
    setTesting(action === "check_connection" ? "connection" : "message");
    setError("");
    setSuccess("");

    if (!token) {
      setError("Sessione admin non trovata.");
      setTesting(null);
      return;
    }

    const payload = await requestTelegramAction(token, action);

    if (!payload.ok) {
      setError(payload.error ?? "Test Telegram non riuscito.");
      setTesting(null);
      return;
    }

    setConnection(payload.connection ?? null);
    setSuccess(
      action === "send_test"
        ? "Messaggio di prova pubblicato nel canale."
        : "Bot e canale collegati correttamente.",
    );
    setTesting(null);
    if (action === "send_test") void loadSettings();
  }

  const environmentReady =
    environment.botTokenConfigured && environment.channelIdConfigured;

  return (
    <div className="grid gap-6">
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="section-kicker">Automazione</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">
              Canale Telegram Lead Host
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              Pubblica automaticamente le nuove opportunità approvate senza
              mostrare dati riservati del proprietario. Un errore Telegram non
              interrompe la pubblicazione nel marketplace.
            </p>
          </div>
          <button
            className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold ${
              settings.enabled
                ? "border-green/20 bg-green/10 text-green"
                : "border-slate-200 bg-slate-50 text-slate-600"
            }`}
            type="button"
            disabled={loading || savingAutomation}
            onClick={() => void toggleAutomation()}
          >
            <Power size={17} />
            {savingAutomation
              ? "Salvataggio..."
              : settings.enabled
                ? "Invii attivi"
                : "Invii disattivati"}
          </button>
        </div>

        {!storageReady || !logsReady ? (
          <StatusBox
            tone="warning"
            text="Applica la migration telegram_channel_notifications per attivare registro e deduplicazione."
          />
        ) : null}
        {error ? <StatusBox tone="error" text={error} /> : null}
        {success ? <StatusBox tone="success" text={success} /> : null}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatusCard
          icon={Bot}
          label="Credenziali"
          value={environmentReady ? "Configurate" : "Da completare"}
          tone={environmentReady ? "success" : "error"}
        />
        <StatusCard
          icon={
            testing === "connection"
              ? RefreshCw
              : connection?.canPost
                ? ShieldCheck
                : CircleOff
          }
          label="Permessi bot"
          value={
            testing === "connection"
              ? "Verifica in corso"
              : connection
              ? connection.canPost
                ? "Pubblicazione consentita"
                : "Permesso mancante"
              : "Da verificare"
          }
          tone={connection?.canPost ? "success" : "neutral"}
        />
        <StatusCard
          icon={Power}
          label="Invio automatico"
          value={settings.enabled ? "Attivo" : "Disattivato"}
          tone={settings.enabled ? "success" : "neutral"}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="section-kicker">Messaggio</p>
              <h2 className="mt-2 text-xl font-semibold text-ink">
                Template nuovo lead
              </h2>
            </div>
            <button
              className="btn btn-primary"
              type="button"
              disabled={saving || loading}
              onClick={saveSettings}
            >
              <Save size={17} />
              {saving ? "Salvataggio..." : "Salva"}
            </button>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {variables.map((variable) => (
              <code
                key={variable}
                className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700"
              >
                {`{{${variable}}}`}
              </code>
            ))}
          </div>

          <label className="mt-5 grid gap-2 text-sm font-semibold text-ink">
            Testo del messaggio
            <textarea
              className="min-h-72 rounded-lg border border-ink/12 p-4 font-mono text-sm leading-6 outline-none focus:border-green"
              value={settings.messageTemplate}
              maxLength={3500}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  messageTemplate: event.target.value,
                }))
              }
            />
          </label>
          <p className="mt-2 text-xs text-muted">
            Il pulsante con link al dettaglio del lead viene aggiunto automaticamente.
          </p>
        </section>

        <section className="card p-5">
          <p className="section-kicker">Collegamento</p>
          <h2 className="mt-2 text-xl font-semibold text-ink">Test bot e canale</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Verifica identità del bot, canale configurato e permesso di pubblicazione.
          </p>

          {connection ? (
            <div className="mt-5 grid gap-3 rounded-lg bg-slate-50 p-4 text-sm">
              <ConnectionRow label="Bot" value={`@${connection.botUsername}`} />
              <ConnectionRow label="Canale" value={connection.channelTitle} />
              <ConnectionRow label="Ruolo" value={connection.membershipStatus} />
            </div>
          ) : null}

          <div className="mt-5 grid gap-2">
            <button
              className="btn btn-secondary w-full"
              type="button"
              disabled={Boolean(testing) || !environmentReady}
              onClick={() => void runTest("check_connection")}
            >
              <RefreshCw size={17} className={testing === "connection" ? "animate-spin" : ""} />
              {testing === "connection" ? "Verifica..." : "Verifica collegamento"}
            </button>
            <button
              className="btn btn-primary w-full"
              type="button"
              disabled={Boolean(testing) || !environmentReady}
              onClick={() => void runTest("send_test")}
            >
              <Send size={17} />
              {testing === "message" ? "Invio..." : "Invia messaggio di prova"}
            </button>
          </div>
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <p className="section-kicker">Registro</p>
          <h2 className="mt-2 text-xl font-semibold text-ink">Ultimi invii Telegram</h2>
        </div>
        {logs.length ? (
          <div className="divide-y divide-slate-100">
            {logs.map((log) => (
              <div
                key={log.id}
                className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_180px]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <LogStatus status={log.status} />
                    <span className="text-xs font-semibold uppercase text-muted">
                      {log.event_type}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    Canale {log.channel_id}
                    {log.provider_message_id
                      ? ` - Messaggio ${log.provider_message_id}`
                      : ""}
                  </p>
                  {log.error_message ? (
                    <p className="mt-2 text-sm font-semibold text-red-700">
                      {log.error_message}
                    </p>
                  ) : null}
                </div>
                <p className="text-sm text-muted lg:text-right">
                  {formatDate(log.sent_at ?? log.created_at)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-muted">
            Nessun invio Telegram registrato.
          </div>
        )}
      </section>
    </div>
  );
}

function StatusCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Bot;
  label: string;
  value: string;
  tone: "success" | "error" | "neutral";
}) {
  return (
    <article className="card flex min-h-32 items-start gap-4 p-5">
      <span
        className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${
          tone === "success"
            ? "bg-green/10 text-green"
            : tone === "error"
              ? "bg-red-50 text-red-700"
              : "bg-slate-100 text-slate-600"
        }`}
      >
        <Icon size={21} />
      </span>
      <div>
        <p className="text-xs font-semibold uppercase text-muted">{label}</p>
        <p className="mt-2 font-semibold text-ink">{value}</p>
      </div>
    </article>
  );
}

function ConnectionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="break-all text-right font-semibold text-ink">{value}</span>
    </div>
  );
}

function LogStatus({ status }: { status: string }) {
  const sent = status === "sent";
  const failed = status === "failed";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
        sent
          ? "bg-green/10 text-green"
          : failed
            ? "bg-red-50 text-red-700"
            : "bg-slate-100 text-slate-600"
      }`}
    >
      {sent ? <CheckCircle2 size={13} /> : failed ? <XCircle size={13} /> : null}
      {status}
    </span>
  );
}

function StatusBox({
  tone,
  text,
}: {
  tone: "success" | "error" | "warning";
  text: string;
}) {
  const classes =
    tone === "success"
      ? "border-green/20 bg-green/8 text-green"
      : tone === "error"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-amber-200 bg-amber-50 text-amber-900";

  return (
    <div className={`mt-5 rounded-lg border px-4 py-3 text-sm font-semibold ${classes}`}>
      {text}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

async function requestTelegramAction(
  token: string,
  action: "check_connection" | "send_test",
) {
  const response = await fetch("/api/admin/telegram", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action }),
  });
  const payload = (await response.json()) as {
    error?: string;
    connection?: TelegramConnection;
  };

  return {
    ...payload,
    ok: response.ok,
  };
}
