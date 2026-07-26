"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  MailCheck,
  RefreshCw,
  Send,
  TestTube2,
  Users,
  X,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

type ServiceEmailCampaign = {
  id: string;
  subject: string;
  preview: string;
  title: string;
  body: string;
  extra: string;
  cta_label: string;
  cta_url: string;
  recipient_scope: string;
  status: string;
  total_recipients: number;
  pending_count: number;
  sent_count: number;
  failed_count: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type ServiceEmailsResponse = {
  storageReady: boolean;
  eligibleRecipients: number;
  campaigns: ServiceEmailCampaign[];
  error?: string;
};

type ServiceEmailDraft = {
  subject: string;
  preview: string;
  title: string;
  body: string;
  extra: string;
  cta_label: string;
  cta_url: string;
};

const emptyDraft: ServiceEmailDraft = {
  subject: "",
  preview: "",
  title: "",
  body: "",
  extra: "",
  cta_label: "",
  cta_url: "",
};

export function AdminServiceEmailsConsole() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [draft, setDraft] = useState<ServiceEmailDraft>(emptyDraft);
  const [campaigns, setCampaigns] = useState<ServiceEmailCampaign[]>([]);
  const [eligibleRecipients, setEligibleRecipients] = useState(0);
  const [storageReady, setStorageReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [serviceOnlyConfirmed, setServiceOnlyConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();

    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadOverview = useCallback(
    async (showLoader = true) => {
      const token = await getAccessToken();

      if (showLoader) setLoading(true);
      setError("");

      if (!token) {
        setError("Sessione admin non trovata.");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/admin/service-emails", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = (await response.json()) as ServiceEmailsResponse;

      if (!response.ok) {
        setError(payload.error ?? "Comunicazioni di servizio non disponibili.");
        setLoading(false);
        return;
      }

      setCampaigns(payload.campaigns);
      setEligibleRecipients(payload.eligibleRecipients);
      setStorageReady(payload.storageReady);
      setLoading(false);
    },
    [getAccessToken],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadOverview(), 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadOverview]);

  const hasActiveCampaigns = campaigns.some((campaign) =>
    ["queued", "processing"].includes(campaign.status),
  );

  useEffect(() => {
    if (!hasActiveCampaigns) return;

    const intervalId = window.setInterval(
      () => void loadOverview(false),
      5000,
    );

    return () => window.clearInterval(intervalId);
  }, [hasActiveCampaigns, loadOverview]);

  const draftIsValid = Boolean(
    draft.subject.trim() && draft.title.trim() && draft.body.trim(),
  );

  function updateDraft(field: keyof ServiceEmailDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function sendTest() {
    if (!draftIsValid) {
      setError("Compila oggetto, titolo e contenuto prima del test.");
      return;
    }

    const token = await getAccessToken();
    setTesting(true);
    setError("");
    setSuccess("");

    if (!token) {
      setError("Sessione admin non trovata.");
      setTesting(false);
      return;
    }

    const response = await fetch("/api/admin/service-emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "test", content: draft }),
    });
    const payload = (await response.json()) as {
      error?: string;
      result?: { status: string };
    };

    if (!response.ok) {
      setError(payload.error ?? "Invio di prova non riuscito.");
      setTesting(false);
      return;
    }

    setSuccess("Email di prova inviata al tuo indirizzo admin.");
    setTesting(false);
  }

  async function queueCampaign() {
    if (!draftIsValid || !serviceOnlyConfirmed) return;

    const token = await getAccessToken();
    setSending(true);
    setError("");
    setSuccess("");

    if (!token) {
      setError("Sessione admin non trovata.");
      setSending(false);
      return;
    }

    const response = await fetch("/api/admin/service-emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "queue",
        content: draft,
        confirmServiceOnly: true,
      }),
    });
    const payload = (await response.json()) as {
      error?: string;
      queuedRecipients?: number;
    };

    if (!response.ok) {
      setError(payload.error ?? "Comunicazione non accodata.");
      setSending(false);
      setConfirmOpen(false);
      return;
    }

    setSuccess(
      `Comunicazione accodata per ${payload.queuedRecipients ?? 0} Property Manager.`,
    );
    setDraft(emptyDraft);
    setSending(false);
    setConfirmOpen(false);
    setServiceOnlyConfirmed(false);
    await loadOverview(false);
  }

  async function processQueue() {
    const token = await getAccessToken();
    setProcessing(true);
    setError("");
    setSuccess("");

    if (!token) {
      setError("Sessione admin non trovata.");
      setProcessing(false);
      return;
    }

    const response = await fetch("/api/admin/service-emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "process" }),
    });
    const payload = (await response.json()) as {
      error?: string;
      result?: { claimed: number; sent: number; retried: number };
    };

    if (!response.ok) {
      setError(payload.error ?? "Coda non elaborata.");
      setProcessing(false);
      return;
    }

    setSuccess(
      payload.result?.claimed
        ? `Coda elaborata: ${payload.result.sent} invii accettati da Resend.`
        : "Non ci sono comunicazioni in attesa.",
    );
    setProcessing(false);
    await loadOverview(false);
  }

  return (
    <div className="grid gap-6">
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="section-kicker">Resend</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">
              Comunicazioni di servizio
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              Avvisi operativi destinati ai Property Manager con account attivo.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-secondary"
              type="button"
              disabled={loading}
              onClick={() => void loadOverview()}
            >
              <RefreshCw size={17} />
              Aggiorna
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={processing || !storageReady}
              onClick={() => void processQueue()}
            >
              <MailCheck size={17} />
              {processing ? "Elaborazione..." : "Elabora coda"}
            </button>
          </div>
        </div>

        <div className="mt-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} />
          <p>
            Usa questa funzione esclusivamente per comunicazioni tecniche,
            contrattuali o indispensabili al servizio. Non inserire promozioni.
          </p>
        </div>

        {!storageReady ? (
          <StatusBox
            tone="warning"
            text="Applica la migration service_email_campaigns per abilitare invio e storico."
          />
        ) : null}
        {error ? <StatusBox tone="error" text={error} /> : null}
        {success ? <StatusBox tone="success" text={success} /> : null}
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Metric
          icon={<Users size={19} />}
          label="Destinatari attivi"
          value={loading ? "..." : String(eligibleRecipients)}
        />
        <Metric
          icon={<Clock3 size={19} />}
          label="Invii in coda"
          value={String(
            campaigns.reduce(
              (total, campaign) => total + campaign.pending_count,
              0,
            ),
          )}
        />
        <Metric
          icon={<MailCheck size={19} />}
          label="Email accettate"
          value={String(
            campaigns.reduce(
              (total, campaign) => total + campaign.sent_count,
              0,
            ),
          )}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="card p-5">
          <div>
            <p className="section-kicker">Nuovo invio</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">
              Prepara la comunicazione
            </h2>
          </div>

          <div className="mt-5 grid gap-4">
            <TextField
              label="Oggetto *"
              value={draft.subject}
              maxLength={180}
              onChange={(value) => updateDraft("subject", value)}
            />
            <TextField
              label="Testo di anteprima"
              value={draft.preview}
              maxLength={220}
              onChange={(value) => updateDraft("preview", value)}
            />
            <TextField
              label="Titolo *"
              value={draft.title}
              maxLength={180}
              onChange={(value) => updateDraft("title", value)}
            />
            <TextArea
              label="Contenuto *"
              value={draft.body}
              maxLength={5000}
              onChange={(value) => updateDraft("body", value)}
            />
            <TextArea
              label="Nota aggiuntiva"
              value={draft.extra}
              maxLength={2000}
              onChange={(value) => updateDraft("extra", value)}
            />
            <div className="grid gap-4 md:grid-cols-[0.4fr_0.6fr]">
              <TextField
                label="Testo pulsante"
                value={draft.cta_label}
                maxLength={80}
                onChange={(value) => updateDraft("cta_label", value)}
              />
              <TextField
                label="URL pulsante"
                value={draft.cta_url}
                maxLength={500}
                onChange={(value) => updateDraft("cta_url", value)}
              />
            </div>

            <p className="text-xs leading-5 text-muted">
              Variabili disponibili:{" "}
              <code className="rounded bg-slate-100 px-1.5 py-1 text-ink">
                {"{{first_name}}"}
              </code>{" "}
              <code className="rounded bg-slate-100 px-1.5 py-1 text-ink">
                {"{{last_name}}"}
              </code>
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                className="btn btn-secondary"
                type="button"
                disabled={testing || !draftIsValid}
                onClick={() => void sendTest()}
              >
                <TestTube2 size={17} />
                {testing ? "Invio test..." : "Invia test a me"}
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={
                  !draftIsValid ||
                  !storageReady ||
                  eligibleRecipients === 0
                }
                onClick={() => {
                  setServiceOnlyConfirmed(false);
                  setConfirmOpen(true);
                }}
              >
                <Send size={17} />
                Prepara invio
              </button>
            </div>
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="border-b border-slate-200 p-5">
            <p className="section-kicker">Anteprima</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">
              Email di servizio
            </h2>
          </div>
          <div className="bg-slate-50 p-4 sm:p-5">
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="section-kicker">Lead Host</p>
              <h3 className="mt-4 text-2xl font-semibold text-ink">
                {previewText(draft.title) || "Titolo della comunicazione"}
              </h3>
              <p className="mt-4 whitespace-pre-line text-sm leading-6 text-muted">
                {previewText(draft.body) ||
                  "Il contenuto della comunicazione apparirà qui."}
              </p>
              {draft.extra ? (
                <p className="mt-4 whitespace-pre-line text-sm font-semibold leading-6 text-ink">
                  {previewText(draft.extra)}
                </p>
              ) : null}
              {draft.cta_label ? (
                <span className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-green px-4 text-sm font-semibold text-white">
                  {previewText(draft.cta_label)}
                </span>
              ) : null}
            </div>
          </div>
        </section>
      </div>

      <CampaignHistory campaigns={campaigns} loading={loading} />

      {confirmOpen ? (
        <ConfirmationDialog
          recipientCount={eligibleRecipients}
          subject={draft.subject}
          confirmed={serviceOnlyConfirmed}
          sending={sending}
          onConfirmedChange={setServiceOnlyConfirmed}
          onCancel={() => {
            if (sending) return;
            setConfirmOpen(false);
            setServiceOnlyConfirmed(false);
          }}
          onConfirm={() => void queueCampaign()}
        />
      ) : null}
    </div>
  );
}

function CampaignHistory({
  campaigns,
  loading,
}: {
  campaigns: ServiceEmailCampaign[];
  loading: boolean;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-slate-200 p-5">
        <p className="section-kicker">Storico</p>
        <h2 className="mt-2 text-xl font-semibold text-ink">
          Comunicazioni inviate
        </h2>
      </div>
      {loading ? (
        <div className="p-8 text-center text-muted">Carico lo storico...</div>
      ) : campaigns.length ? (
        <div className="divide-y divide-slate-100">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CampaignStatus status={campaign.status} />
                  <span className="text-xs font-semibold text-muted">
                    {formatDate(campaign.created_at)}
                  </span>
                </div>
                <p className="mt-2 truncate font-semibold text-ink">
                  {campaign.subject}
                </p>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted">
                  {campaign.body}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center lg:min-w-64">
                <CountBox label="Totali" value={campaign.total_recipients} />
                <CountBox label="Inviate" value={campaign.sent_count} />
                <CountBox label="Errori" value={campaign.failed_count} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-8 text-center text-muted">
          Nessuna comunicazione di servizio inviata.
        </div>
      )}
    </section>
  );
}

function ConfirmationDialog({
  recipientCount,
  subject,
  confirmed,
  sending,
  onConfirmedChange,
  onCancel,
  onConfirm,
}: {
  recipientCount: number;
  subject: string;
  confirmed: boolean;
  sending: boolean;
  onConfirmedChange: (value: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="service-email-confirmation-title"
    >
      <div className="max-h-[92vh] w-full overflow-y-auto bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-lg sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="section-kicker">Conferma invio</p>
            <h2
              id="service-email-confirmation-title"
              className="mt-2 text-2xl font-semibold text-ink"
            >
              Invia a {recipientCount} Property Manager
            </h2>
          </div>
          <button
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600"
            type="button"
            aria-label="Chiudi"
            disabled={sending}
            onClick={onCancel}
          >
            <X size={19} />
          </button>
        </div>

        <div className="mt-5 rounded-lg bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase text-muted">Oggetto</p>
          <p className="mt-2 font-semibold text-ink">{subject}</p>
        </div>

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          <input
            className="mt-1 size-4 shrink-0 accent-emerald-700"
            type="checkbox"
            checked={confirmed}
            onChange={(event) => onConfirmedChange(event.target.checked)}
          />
          Confermo che il messaggio è una comunicazione di servizio necessaria e
          non contiene contenuti promozionali.
        </label>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            className="btn btn-secondary"
            type="button"
            disabled={sending}
            onClick={onCancel}
          >
            Annulla
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={!confirmed || sending}
            onClick={onConfirm}
          >
            <Send size={17} />
            {sending ? "Accodamento..." : `Invia a ${recipientCount} PM`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="card flex min-h-28 items-center gap-4 p-5">
      <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-green/10 text-green">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase text-muted">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  maxLength,
  onChange,
}: {
  label: string;
  value: string;
  maxLength: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-ink">
      {label}
      <input
        className="min-h-12 rounded-lg border border-ink/12 px-4 outline-none focus:border-green"
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  maxLength,
  onChange,
}: {
  label: string;
  value: string;
  maxLength: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-ink">
      {label}
      <textarea
        className="min-h-32 rounded-lg border border-ink/12 p-4 outline-none focus:border-green"
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function CampaignStatus({ status }: { status: string }) {
  const config: Record<
    string,
    { label: string; className: string; icon?: React.ReactNode }
  > = {
    queued: {
      label: "In coda",
      className: "bg-blue-50 text-blue-700",
      icon: <Clock3 size={13} />,
    },
    processing: {
      label: "In invio",
      className: "bg-blue-50 text-blue-700",
      icon: <RefreshCw size={13} />,
    },
    completed: {
      label: "Completata",
      className: "bg-green/10 text-green",
      icon: <CheckCircle2 size={13} />,
    },
    completed_with_errors: {
      label: "Completata con errori",
      className: "bg-amber-50 text-amber-800",
      icon: <AlertTriangle size={13} />,
    },
    failed: {
      label: "Non riuscita",
      className: "bg-red-50 text-red-700",
      icon: <AlertTriangle size={13} />,
    },
  };
  const item = config[status] ?? {
    label: status,
    className: "bg-slate-100 text-slate-600",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${item.className}`}
    >
      {item.icon}
      {item.label}
    </span>
  );
}

function CountBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase text-muted">{label}</p>
      <p className="mt-1 font-semibold text-ink">{value}</p>
    </div>
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
    <div className={`mt-5 rounded-lg border p-4 text-sm font-semibold ${className}`}>
      {text}
    </div>
  );
}

function previewText(value: string) {
  return value
    .replace(/\{\{\s*first_name\s*\}\}/g, "Luca")
    .replace(/\{\{\s*last_name\s*\}\}/g, "Rossi");
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
