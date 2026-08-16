"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, Crown, Save, ShieldCheck } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

type PrimeSettings = {
  defaultAccessDurationHours: number;
};

type PrimeSettingsResponse = {
  settings?: PrimeSettings;
  storageReady?: boolean;
  error?: string;
};

export function AdminPrimeSettings() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [settings, setSettings] = useState<PrimeSettings>({
    defaultAccessDurationHours: 12,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storageReady, setStorageReady] = useState(true);
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

    const response = await fetch("/api/admin/prime/settings", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json()) as PrimeSettingsResponse;

    if (!response.ok || !payload.settings) {
      setError(payload.error ?? "Non riesco a caricare le impostazioni PRIME.");
      setLoading(false);
      return;
    }

    setSettings(payload.settings);
    setStorageReady(payload.storageReady ?? true);
    setLoading(false);
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

    const response = await fetch("/api/admin/prime/settings", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(settings),
    });
    const payload = (await response.json()) as PrimeSettingsResponse;

    if (!response.ok) {
      setError(payload.error ?? "Salvataggio impostazioni PRIME non riuscito.");
      setSaving(false);
      return;
    }

    setSuccess("Impostazioni PRIME aggiornate con successo.");
    setSaving(false);
  }

  return (
    <div className="grid gap-6">
      <section className="card p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <Crown size={23} />
            </span>
            <div>
              <p className="section-kicker">Lead Host PRIME</p>
              <h2 className="mt-1 text-xl font-semibold text-ink sm:text-2xl">
                Impostazioni sistema PRIME
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                Gestisci i parametri generali della Prime Zone. Le modifiche si
                applicano alle nuove assegnazioni e non cambiano i lead gia in corso.
              </p>
            </div>
          </div>
          <button
            className="btn btn-primary w-full sm:w-auto"
            type="button"
            disabled={saving || loading || !storageReady}
            onClick={() => void saveSettings()}
          >
            <Save size={17} />
            {saving ? "Salvataggio..." : "Salva impostazioni"}
          </button>
        </div>

        {!storageReady ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            La configurazione persistente non e disponibile. Verifica la tabella settings.
          </div>
        ) : null}
        {error ? (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="mt-5 rounded-xl border border-green/20 bg-green/10 p-4 text-sm font-semibold text-green">
            {success}
          </div>
        ) : null}
      </section>

      <section className="card p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-green/10 text-green">
            <Clock3 size={22} />
          </span>
          <div>
            <p className="section-kicker">Prime Zone</p>
            <h3 className="text-lg font-semibold text-ink sm:text-xl">
              Durata accesso esclusivo
            </h3>
          </div>
        </div>

        {loading ? (
          <p className="mt-6 text-sm font-medium text-muted">Carico impostazioni...</p>
        ) : (
          <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]">
            <label className="grid gap-2 text-sm font-semibold text-ink">
              Durata predefinita
              <div className="flex min-h-12 items-center rounded-lg border border-ink/12 bg-white px-4 focus-within:border-green">
                <input
                  className="min-h-10 min-w-0 flex-1 bg-transparent outline-none"
                  inputMode="numeric"
                  min={1}
                  max={720}
                  type="number"
                  value={settings.defaultAccessDurationHours}
                  onChange={(event) =>
                    setSettings({
                      defaultAccessDurationHours: Math.min(
                        720,
                        Math.max(1, Number.parseInt(event.target.value, 10) || 1),
                      ),
                    })
                  }
                />
                <span className="text-sm font-semibold text-muted">ore</span>
              </div>
              <span className="text-xs font-medium leading-5 text-muted">
                Valore consentito: da 1 ora a 720 ore (30 giorni).
              </span>
            </label>

            <div className="rounded-xl border border-ink/10 bg-slate-50 p-4">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 shrink-0 text-green" size={20} />
                <p className="text-sm leading-6 text-muted">
                  Questa durata viene proposta quando un lead viene assegnato alla
                  Prime Zone. Admin e Account Manager possono ancora personalizzarla
                  sul singolo lead. Le assegnazioni gia attive non vengono modificate.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
