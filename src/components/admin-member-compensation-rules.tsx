"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeEuro, Save } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

type Rules = {
  leadVerificationEnabled: boolean;
  primeFirstActivationEnabled: boolean;
  primeRenewalEnabled: boolean;
  primeLeadPurchaseEnabled: boolean;
  leadVerificationCentsOverride: number | null;
  primeFirstActivationCentsOverride: number | null;
  primeRenewalCentsOverride: number | null;
  primeLeadPurchaseBasisPointsOverride: number | null;
};

type GlobalSettings = {
  leadVerificationCents: number;
  primeFirstActivationCents: number;
  primeRenewalCents: number;
  primeLeadPurchaseBasisPoints: number;
};

type ResponsePayload = {
  rules?: Rules;
  globalSettings?: GlobalSettings;
  error?: string;
};

export function AdminMemberCompensationRules({
  memberId,
  onDirtyChange,
}: {
  memberId: string;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [rules, setRules] = useState<Rules | null>(null);
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadRules = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setError("Sessione Super Admin non disponibile.");
      setLoading(false);
      return;
    }

    const response = await fetch(
      `/api/admin/team/members/${memberId}/compensation-rules`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );
    const payload = (await response.json()) as ResponsePayload;
    if (!response.ok || !payload.rules || !payload.globalSettings) {
      setError(payload.error ?? "Non riesco a caricare le regole compensi.");
    } else {
      setRules(payload.rules);
      setGlobalSettings(payload.globalSettings);
      onDirtyChange?.(false);
    }
    setLoading(false);
  }, [getToken, memberId, onDirtyChange]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadRules(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadRules]);

  async function saveRules() {
    if (!rules) return;
    setSaving(true);
    setError("");
    setSuccess("");
    const token = await getToken();

    if (!token) {
      setError("Sessione Super Admin non disponibile.");
      setSaving(false);
      return;
    }

    const response = await fetch(
      `/api/admin/team/members/${memberId}/compensation-rules`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(rules),
      },
    );
    const payload = (await response.json()) as ResponsePayload;
    if (!response.ok || !payload.rules) {
      setError(payload.error ?? "Salvataggio regole compensi non riuscito.");
    } else {
      setRules(payload.rules);
      setSuccess("Regole compensi del membro aggiornate.");
      onDirtyChange?.(false);
    }
    setSaving(false);
  }

  return (
    <section className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <BadgeEuro className="mt-0.5 shrink-0 text-green" size={20} />
          <div>
            <p className="text-sm font-bold text-ink">Regole compensi</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              Abilita solo le attività previste per questo membro. Lascia vuoto un importo per utilizzare il valore predefinito.
            </p>
          </div>
        </div>
        <button
          className="btn btn-secondary w-full sm:w-auto"
          type="button"
          disabled={saving || loading || !rules}
          onClick={() => void saveRules()}
        >
          <Save size={16} />
          {saving ? "Salvataggio..." : "Salva regole compensi"}
        </button>
      </div>

      {loading ? <p className="mt-4 text-sm text-muted">Carico regole...</p> : null}
      {error ? <p className="mt-4 text-sm font-semibold text-red-700">{error}</p> : null}
      {success ? <p className="mt-4 text-sm font-semibold text-green">{success}</p> : null}

      {rules && globalSettings ? (
        <div className="mt-4 grid gap-3">
          <RuleRow label="Verifica Lead interessato" enabled={rules.leadVerificationEnabled} override={rules.leadVerificationCentsOverride} defaultValue={globalSettings.leadVerificationCents} kind="money" onEnabledChange={(value) => { setRules({ ...rules, leadVerificationEnabled: value }); onDirtyChange?.(true); }} onOverrideChange={(value) => { setRules({ ...rules, leadVerificationCentsOverride: value }); onDirtyChange?.(true); }} />
          <RuleRow label="Acquisizione nuovo PM PRIME" enabled={rules.primeFirstActivationEnabled} override={rules.primeFirstActivationCentsOverride} defaultValue={globalSettings.primeFirstActivationCents} kind="money" onEnabledChange={(value) => { setRules({ ...rules, primeFirstActivationEnabled: value }); onDirtyChange?.(true); }} onOverrideChange={(value) => { setRules({ ...rules, primeFirstActivationCentsOverride: value }); onDirtyChange?.(true); }} />
          <RuleRow label="Rinnovo mensile PM PRIME" enabled={rules.primeRenewalEnabled} override={rules.primeRenewalCentsOverride} defaultValue={globalSettings.primeRenewalCents} kind="money" onEnabledChange={(value) => { setRules({ ...rules, primeRenewalEnabled: value }); onDirtyChange?.(true); }} onOverrideChange={(value) => { setRules({ ...rules, primeRenewalCentsOverride: value }); onDirtyChange?.(true); }} />
          <RuleRow label="Acquisto Lead da PM PRIME" enabled={rules.primeLeadPurchaseEnabled} override={rules.primeLeadPurchaseBasisPointsOverride} defaultValue={globalSettings.primeLeadPurchaseBasisPoints} kind="percentage" onEnabledChange={(value) => { setRules({ ...rules, primeLeadPurchaseEnabled: value }); onDirtyChange?.(true); }} onOverrideChange={(value) => { setRules({ ...rules, primeLeadPurchaseBasisPointsOverride: value }); onDirtyChange?.(true); }} />
        </div>
      ) : null}
    </section>
  );
}

function RuleRow({ label, enabled, override, defaultValue, kind, onEnabledChange, onOverrideChange }: { label: string; enabled: boolean; override: number | null; defaultValue: number; kind: "money" | "percentage"; onEnabledChange: (value: boolean) => void; onOverrideChange: (value: number | null) => void }) {
  const suffix = kind === "money" ? "EUR" : "%";
  const displayedDefault = kind === "money" ? (defaultValue / 100).toFixed(2).replace(".", ",") : (defaultValue / 100).toFixed(2).replace(".", ",");
  const displayedOverride = override === null ? "" : (override / 100).toFixed(2).replace(".", ",");

  return (
    <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center">
      <label className="flex min-w-0 items-center gap-3 text-sm font-semibold text-ink">
        <input className="size-4 accent-emerald-700" type="checkbox" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} />
        <span>{label}</span>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-muted">
        Override ({suffix})
        <input
          className="form-input py-2"
          inputMode="decimal"
          disabled={!enabled}
          value={displayedOverride}
          placeholder={`Default ${displayedDefault}`}
          onChange={(event) => {
            const raw = event.target.value.trim();
            if (!raw) return onOverrideChange(null);
            const parsed = Number(raw.replace(",", "."));
            if (Number.isFinite(parsed) && parsed >= 0) {
              onOverrideChange(Math.round(parsed * 100));
            }
          }}
        />
      </label>
    </div>
  );
}
