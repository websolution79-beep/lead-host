"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageCircle, Save } from "lucide-react";
import { useAppSession } from "@/components/app-session-provider";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

type WidgetSettings = {
  enabled: boolean;
  businessNumber: string;
  prefilledMessage: string;
};

type SettingsResponse = {
  settings?: WidgetSettings;
  error?: string;
};

const initialSettings: WidgetSettings = {
  enabled: true,
  businessNumber: "393882497011",
  prefilledMessage: "Ciao, avrei bisogno di informazioni generali su Lead Host.",
};

export function AdminWhatsAppWidgetSettings() {
  const session = useAppSession();
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [settings, setSettings] = useState(initialSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadSettings = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      setError("Sessione Super Admin non trovata.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/admin/settings/whatsapp-widget", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json()) as SettingsResponse;

    if (!response.ok || !payload.settings) {
      setError(payload.error ?? "Non riesco a caricare le impostazioni WhatsApp.");
      setLoading(false);
      return;
    }

    setSettings(payload.settings);
    setLoading(false);
  }, [getAccessToken]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadSettings(), 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadSettings]);

  if (!session.isSuperAdmin) return null;

  async function saveSettings() {
    const token = await getAccessToken();
    if (!token) {
      setError("Sessione Super Admin non trovata.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    const response = await fetch("/api/admin/settings/whatsapp-widget", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...settings,
        businessNumber: settings.businessNumber.replace(/\D/g, ""),
      }),
    });
    const payload = (await response.json()) as SettingsResponse;

    if (!response.ok || !payload.settings) {
      setError(payload.error ?? "Non riesco a salvare le impostazioni WhatsApp.");
      setSaving(false);
      return;
    }

    setSettings(payload.settings);
    setSuccess("Widget WhatsApp aggiornato.");
    setSaving(false);
  }

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[#25D366]/15 text-[#128C3E]">
            <MessageCircle size={22} />
          </span>
          <div>
            <p className="section-kicker">Supporto diretto</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">Widget WhatsApp</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Visibile solo nelle aree riservate. Invita prima a usare
              l&apos;Assistenza e lascia WhatsApp per le informazioni generali.
            </p>
          </div>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          disabled={loading || saving}
          onClick={() => void saveSettings()}
        >
          <Save size={17} />
          {saving ? "Salvataggio..." : "Salva widget"}
        </button>
      </div>

      {loading ? <p className="mt-5 text-sm font-medium text-muted">Carico impostazioni...</p> : null}

      {!loading ? (
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-700">
            <input
              className="mt-0.5 size-4 shrink-0 accent-[#25D366]"
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) =>
                setSettings((current) => ({ ...current, enabled: event.target.checked }))
              }
            />
            <span>
              Widget attivo
              <span className="mt-1 block text-xs font-normal text-muted">
                Quando disattivo, non viene mostrato a nessun utente autenticato.
              </span>
            </span>
          </label>

          <label className="grid gap-2 text-sm font-bold text-ink">
            Numero WhatsApp Business
            <input
              className="input"
              inputMode="tel"
              value={settings.businessNumber}
              onChange={(event) =>
                setSettings((current) => ({ ...current, businessNumber: event.target.value }))
              }
              placeholder="393882497011"
            />
            <span className="text-xs font-normal text-muted">Inserisci solo cifre, con prefisso internazionale.</span>
          </label>
        </div>
      ) : null}

      {!loading ? (
        <label className="mt-5 grid gap-2 text-sm font-bold text-ink">
          Messaggio precompilato WhatsApp
          <textarea
            className="input min-h-24 resize-y py-3"
            value={settings.prefilledMessage}
            maxLength={500}
            onChange={(event) =>
              setSettings((current) => ({ ...current, prefilledMessage: event.target.value }))
            }
          />
        </label>
      ) : null}

      {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {success ? <p className="mt-4 rounded-lg border border-green/20 bg-green/10 p-3 text-sm font-semibold text-green">{success}</p> : null}
    </section>
  );
}
