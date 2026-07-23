"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Mail,
  Power,
  RefreshCw,
  Save,
  Send,
  XCircle,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import type { TransactionalEmailTemplate } from "@/lib/config/transactional-email-settings";

type EmailLog = {
  id: string;
  recipient_email: string;
  event_type: string;
  subject: string;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
};

type EmailTemplatesResponse = {
  templates: TransactionalEmailTemplate[];
  logs: EmailLog[];
  logsReady: boolean;
  storageReady: boolean;
  error?: string;
};

export function AdminEmailTemplatesConsole() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [templates, setTemplates] = useState<TransactionalEmailTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [storageReady, setStorageReady] = useState(true);
  const [logsReady, setLogsReady] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedTemplate =
    templates.find((template) => template.id === selectedId) ?? templates[0] ?? null;

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();

    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadTemplates = useCallback(async () => {
    const token = await getAccessToken();
    setLoading(true);
    setError("");
    setSuccess("");

    if (!token) {
      setError("Sessione admin non trovata.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/admin/email-templates", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json()) as EmailTemplatesResponse;

    if (!response.ok) {
      setError(payload.error ?? "Non riesco a caricare i template email.");
      setLoading(false);
      return;
    }

    setTemplates(payload.templates);
    setSelectedId((current) => current || payload.templates[0]?.id || "");
    setLogs(payload.logs);
    setStorageReady(payload.storageReady);
    setLogsReady(payload.logsReady);
    setLoading(false);
  }, [getAccessToken]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadTemplates(), 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadTemplates]);

  function updateSelectedTemplate(update: Partial<TransactionalEmailTemplate>) {
    if (!selectedTemplate) return;

    setTemplates((current) =>
      current.map((template) =>
        template.id === selectedTemplate.id ? { ...template, ...update } : template,
      ),
    );
  }

  async function saveTemplates() {
    const token = await getAccessToken();
    setSaving(true);
    setError("");
    setSuccess("");

    if (!token) {
      setError("Sessione admin non trovata.");
      setSaving(false);
      return;
    }

    const response = await fetch("/api/admin/email-templates", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ templates }),
    });
    const payload = (await response.json()) as EmailTemplatesResponse;

    if (!response.ok) {
      setError(payload.error ?? "Non sono riuscito a salvare i template.");
      setSaving(false);
      return;
    }

    setTemplates(payload.templates);
    setSuccess("Template email salvati.");
    setSaving(false);
  }

  async function sendTestEmail() {
    if (!selectedTemplate) return;

    const token = await getAccessToken();
    setTesting(true);
    setError("");
    setSuccess("");

    if (!token) {
      setError("Sessione admin non trovata.");
      setTesting(false);
      return;
    }

    const response = await fetch("/api/admin/email-templates", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ templateId: selectedTemplate.id }),
    });
    const payload = (await response.json()) as { error?: string; result?: { status: string } };

    if (!response.ok) {
      setError(payload.error ?? "Invio test non riuscito.");
      setTesting(false);
      return;
    }

    setSuccess(`Email test elaborata: ${payload.result?.status ?? "ok"}.`);
    setTesting(false);
    void loadTemplates();
  }

  return (
    <div className="grid gap-6">
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="section-kicker">Email</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">
              Email transazionali
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              Gestisci testi, pulsanti e stato di invio delle email applicative
              inviate tramite Resend. La conferma account Supabase Auth resta nel
              dashboard Supabase.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-secondary"
              type="button"
              disabled={loading}
              onClick={() => void loadTemplates()}
            >
              <RefreshCw size={17} />
              Aggiorna
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={saving || loading}
              onClick={saveTemplates}
            >
              <Save size={17} />
              {saving ? "Salvataggio..." : "Salva template"}
            </button>
          </div>
        </div>

        {!storageReady ? (
          <StatusBox tone="warning" text="La tabella settings non è disponibile: sto usando i template di fallback." />
        ) : null}
        {!logsReady ? (
          <StatusBox tone="warning" text="Lo storico email non è ancora disponibile." />
        ) : null}
        {error ? <StatusBox tone="error" text={error} /> : null}
        {success ? <StatusBox tone="success" text={success} /> : null}
      </section>

      {loading ? (
        <section className="card p-8 text-center text-muted">Carico template email...</section>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
          <section className="card overflow-hidden">
            <div className="border-b border-slate-200 p-5">
              <p className="section-kicker">Template</p>
              <h2 className="mt-2 text-xl font-semibold text-ink">Flussi email</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {templates.map((template) => (
                <button
                  key={template.id}
                  className={`grid w-full gap-2 p-4 text-left transition ${
                    selectedTemplate?.id === template.id
                      ? "bg-green/8"
                      : "bg-white hover:bg-slate-50"
                  }`}
                  type="button"
                  onClick={() => setSelectedId(template.id)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-ink">{template.label}</span>
                    <StatusPill enabled={template.enabled} />
                  </div>
                  <span className="text-xs leading-5 text-muted">
                    {template.description}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {selectedTemplate ? (
            <TemplateEditor
              template={selectedTemplate}
              testing={testing}
              onChange={updateSelectedTemplate}
              onTest={sendTestEmail}
            />
          ) : null}
        </div>
      )}

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <p className="section-kicker">Storico</p>
          <h2 className="mt-2 text-xl font-semibold text-ink">Ultimi invii</h2>
        </div>
        {logs.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {logs.map((log) => (
              <div key={log.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_160px]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <LogStatus status={log.status} />
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                      {log.event_type}
                    </span>
                  </div>
                  <p className="mt-2 truncate font-semibold text-ink">{log.subject}</p>
                  <p className="mt-1 break-all text-sm text-muted">{log.recipient_email}</p>
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
          <div className="p-8 text-center">
            <Mail className="mx-auto text-slate-400" size={34} />
            <p className="mt-3 font-semibold text-ink">Nessun invio registrato</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Qui vedrai email inviate, fallite o saltate.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function TemplateEditor({
  template,
  testing,
  onChange,
  onTest,
}: {
  template: TransactionalEmailTemplate;
  testing: boolean;
  onChange: (update: Partial<TransactionalEmailTemplate>) => void;
  onTest: () => void;
}) {
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="section-kicker">Editor</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">{template.label}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            {template.description}
          </p>
        </div>
        <button
          className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-4 text-sm font-semibold ${
            template.enabled
              ? "border-green/20 bg-green/10 text-green"
              : "border-slate-200 bg-slate-50 text-slate-500"
          }`}
          type="button"
          onClick={() => onChange({ enabled: !template.enabled })}
        >
          <Power size={16} />
          {template.enabled ? "Attiva" : "Disattiva"}
        </button>
      </div>

      <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-muted">
        Variabili disponibili:{" "}
        {template.variables.map((variable) => (
          <code
            key={variable}
            className="mr-1 rounded bg-white px-1.5 py-1 font-semibold text-ink"
          >
            {`{{${variable}}}`}
          </code>
        ))}
      </div>

      <div className="mt-6 grid gap-4">
        <TextField
          label="Oggetto"
          value={template.subject}
          onChange={(value) => onChange({ subject: value })}
        />
        <TextField
          label="Anteprima"
          value={template.preview}
          onChange={(value) => onChange({ preview: value })}
        />
        <TextField
          label="Titolo"
          value={template.title}
          onChange={(value) => onChange({ title: value })}
        />
        <TextArea
          label="Testo principale"
          value={template.body}
          onChange={(value) => onChange({ body: value })}
        />
        <TextArea
          label="Testo extra"
          value={template.extra}
          onChange={(value) => onChange({ extra: value })}
        />
        <div className="grid gap-4 lg:grid-cols-[0.45fr_0.55fr]">
          <TextField
            label="Testo pulsante"
            value={template.ctaLabel}
            onChange={(value) => onChange({ ctaLabel: value })}
          />
          <TextField
            label="URL pulsante"
            value={template.ctaUrl}
            onChange={(value) => onChange({ ctaUrl: value })}
          />
        </div>
        <button
          className="btn btn-secondary w-fit"
          type="button"
          disabled={testing}
          onClick={onTest}
        >
          <Send size={17} />
          {testing ? "Invio test..." : "Invia test a me"}
        </button>
      </div>
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-ink">
      {label}
      <input
        className="min-h-12 rounded-lg border border-ink/12 px-4 outline-none focus:border-green"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-ink">
      {label}
      <textarea
        className="min-h-28 rounded-lg border border-ink/12 p-4 outline-none focus:border-green"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function StatusPill({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        enabled ? "bg-green/10 text-green" : "bg-slate-100 text-slate-500"
      }`}
    >
      {enabled ? "Attiva" : "Disattiva"}
    </span>
  );
}

function LogStatus({ status }: { status: string }) {
  const isSent = status === "sent";
  const isFailed = status === "failed";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
        isSent
          ? "bg-green/10 text-green"
          : isFailed
            ? "bg-red-50 text-red-700"
            : "bg-slate-100 text-slate-600"
      }`}
    >
      {isSent ? <CheckCircle2 size={13} /> : isFailed ? <XCircle size={13} /> : null}
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
  const className =
    tone === "success"
      ? "border-green/20 bg-green/10 text-green"
      : tone === "error"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <div className={`mt-5 rounded-xl border p-4 text-sm font-semibold ${className}`}>
      {text}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
