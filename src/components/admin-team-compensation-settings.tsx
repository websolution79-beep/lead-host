"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeEuro, Percent, Save, ShieldCheck } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

type CompensationSettings = {
  featureEnabled: boolean;
  leadVerificationCents: number;
  primeFirstActivationCents: number;
  primeRenewalCents: number;
  primeLeadPurchaseBasisPoints: number;
  currency: "EUR";
};

type SettingsResponse = {
  settings?: CompensationSettings;
  storageReady?: boolean;
  error?: string;
};

const defaults: CompensationSettings = {
  featureEnabled: false,
  leadVerificationCents: 300,
  primeFirstActivationCents: 5_000,
  primeRenewalCents: 2_000,
  primeLeadPurchaseBasisPoints: 1_000,
  currency: "EUR",
};

export function AdminTeamCompensationSettings() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [settings, setSettings] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storageReady, setStorageReady] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    const token = await getToken();

    if (!token) {
      setError("Sessione Super Admin non disponibile.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/admin/team/compensation-settings", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json()) as SettingsResponse;

    if (!response.ok || !payload.settings) {
      setError(payload.error ?? "Non riesco a caricare i compensi predefiniti.");
    } else {
      setSettings(payload.settings);
      setStorageReady(payload.storageReady ?? true);
    }
    setLoading(false);
  }, [getToken]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadSettings(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadSettings]);

  async function saveSettings() {
    setSaving(true);
    setError("");
    setSuccess("");
    const token = await getToken();

    if (!token) {
      setError("Sessione Super Admin non disponibile.");
      setSaving(false);
      return;
    }

    const response = await fetch("/api/admin/team/compensation-settings", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        leadVerificationCents: settings.leadVerificationCents,
        primeFirstActivationCents: settings.primeFirstActivationCents,
        primeRenewalCents: settings.primeRenewalCents,
        primeLeadPurchaseBasisPoints: settings.primeLeadPurchaseBasisPoints,
      }),
    });
    const payload = (await response.json()) as SettingsResponse;

    if (!response.ok || !payload.settings) {
      setError(payload.error ?? "Salvataggio dei compensi non riuscito.");
    } else {
      setSettings(payload.settings);
      setSuccess("Compensi predefiniti aggiornati con successo.");
    }
    setSaving(false);
  }

  if (loading) {
    return <p className="p-6 text-sm font-semibold text-muted">Carico impostazioni compensi...</p>;
  }

  return (
    <div className="grid gap-6 p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-green/10 text-green">
            <BadgeEuro size={21} />
          </span>
          <div>
            <h3 className="text-lg font-semibold text-ink">Compensi predefiniti</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
              Questi valori saranno usati solo per nuove attività maturate. Le personalizzazioni per singolo membro e i compensi già registrati non verranno modificati.
            </p>
          </div>
        </div>
        <button
          className="btn btn-primary w-full sm:w-auto"
          type="button"
          disabled={saving || !storageReady}
          onClick={() => void saveSettings()}
        >
          <Save size={17} />
          {saving ? "Salvataggio..." : "Salva compensi"}
        </button>
      </div>

      {!settings.featureEnabled ? (
        <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
          <ShieldCheck className="mt-0.5 shrink-0" size={19} />
          <p>
            Configurazione protetta: il motore compensi è ancora disattivato. Puoi preparare i valori senza generare movimenti o modificare i flussi in produzione.
          </p>
        </div>
      ) : null}
      {!storageReady ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          Archivio compensi non disponibile. Verifica la migration prima di salvare.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>
      ) : null}
      {success ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{success}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <MoneyField
          label="Verifica Lead interessato"
          description="Compenso dopo conferma manuale del lead verificato nello stato Interessato."
          value={settings.leadVerificationCents}
          onChange={(value) => setSettings((current) => ({ ...current, leadVerificationCents: value }))}
        />
        <MoneyField
          label="Acquisizione nuovo PM PRIME"
          description="Compenso una tantum sulla prima attivazione PRIME pagata."
          value={settings.primeFirstActivationCents}
          onChange={(value) => setSettings((current) => ({ ...current, primeFirstActivationCents: value }))}
        />
        <MoneyField
          label="Rinnovo mensile PM PRIME"
          description="Compenso su ogni rinnovo pagato successivo alla prima attivazione."
          value={settings.primeRenewalCents}
          onChange={(value) => setSettings((current) => ({ ...current, primeRenewalCents: value }))}
        />
        <PercentageField
          value={settings.primeLeadPurchaseBasisPoints}
          onChange={(value) => setSettings((current) => ({ ...current, primeLeadPurchaseBasisPoints: value }))}
        />
      </div>
    </div>
  );
}

function MoneyField({ label, description, value, onChange }: { label: string; description: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <span className="block text-sm font-bold text-ink">{label}</span>
      <span className="mt-1 block min-h-10 text-xs leading-5 text-muted">{description}</span>
      <span className="mt-3 flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:border-green">
        <span className="px-3 text-sm font-bold text-muted">EUR</span>
        <input
          className="min-w-0 flex-1 border-0 bg-transparent px-3 py-3 text-base font-semibold text-ink outline-none"
          inputMode="decimal"
          value={(value / 100).toFixed(2).replace(".", ",")}
          onChange={(event) => onChange(parseEuroCents(event.target.value))}
        />
      </span>
    </label>
  );
}

function PercentageField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <label className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <span className="block text-sm font-bold text-ink">Acquisto Lead da PM PRIME</span>
      <span className="mt-1 block min-h-10 text-xs leading-5 text-muted">Percentuale sul prezzo effettivo del lead acquistato dal cliente PRIME assegnato.</span>
      <span className="mt-3 flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:border-green">
        <Percent className="ml-3 text-muted" size={17} />
        <input
          className="min-w-0 flex-1 border-0 bg-transparent px-3 py-3 text-base font-semibold text-ink outline-none"
          inputMode="decimal"
          value={(value / 100).toFixed(2).replace(".", ",")}
          onChange={(event) => onChange(parsePercentageBasisPoints(event.target.value))}
        />
      </span>
    </label>
  );
}

function parseEuroCents(value: string) {
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : 0;
}

function parsePercentageBasisPoints(value: string) {
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(10_000, Math.round(parsed * 100));
}
