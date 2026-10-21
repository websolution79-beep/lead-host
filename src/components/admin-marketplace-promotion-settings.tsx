"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Megaphone, Save } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import {
  parseMarketplacePromotionDraft,
  type MarketplacePromotionSettingsResponse,
} from "@/lib/team-compensation/marketplace-promotion-config";

type Response = Partial<MarketplacePromotionSettingsResponse> & { error?: string };

export function AdminMarketplacePromotionSettings({ generalEngineEnabled }: { generalEngineEnabled?: boolean }) {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [minutes, setMinutes] = useState("0");
  const [euros, setEuros] = useState("0,00");
  const [ready, setReady] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [compensationEnabled, setCompensationEnabled] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [savedEnabled, setSavedEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const request = useCallback(async (body?: unknown, signal?: AbortSignal) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("Sessione Super Admin non disponibile.");
    const response = await fetch("/api/admin/team/marketplace-promotion-settings", {
      method: body ? "PATCH" : "GET",
      headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
      cache: "no-store",
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    const payload = await response.json() as Response;
    if (!response.ok || !payload.settings || !payload.storageReady) {
      throw new Error(payload.error ?? "Impostazioni promozioni non disponibili.");
    }
    return payload;
  }, [supabase]);

  useEffect(() => {
    const controller = new AbortController();
    void request(undefined, controller.signal).then((payload) => {
      if (controller.signal.aborted || !payload.settings) return;
      setMinutes(String(payload.settings.waitMinutes));
      setEuros((payload.settings.saleCents / 100).toFixed(2).replace(".", ","));
      setReady(true);
      setEngineReady(payload.engineReady === true);
      setCompensationEnabled(payload.compensationEnabled === true);
      setEnabled(payload.settings.enabled);
      setSavedEnabled(payload.settings.enabled);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Caricamento non riuscito.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [request, generalEngineEnabled]);

  async function save() {
    setError("");
    setSuccess("");
    const draft = parseMarketplacePromotionDraft(minutes, euros);
    if (!draft) {
      setError("Inserisci minuti interi da 0 a 525600 e un compenso da 0 a 10000 EUR con massimo due decimali.");
      return;
    }
    if (enabled && !savedEnabled && !window.confirm("Attivare la promozione dei lead Marketplace con questi parametri? Le nuove vendite dei lead presi in carico genereranno il compenso impostato.")) return;
    setSaving(true);
    try {
      const payload = await request({ ...draft, enabled });
      if (payload.settings) {
        setMinutes(String(payload.settings.waitMinutes));
        setEuros((payload.settings.saleCents / 100).toFixed(2).replace(".", ","));
        setEnabled(payload.settings.enabled);
        setSavedEnabled(payload.settings.enabled);
      }
      setEngineReady(payload.engineReady === true);
      setCompensationEnabled(payload.compensationEnabled === true);
      setSuccess(payload.settings?.enabled ? "Promozione attiva. Parametri salvati." : "Parametri salvati. La promozione resta disattivata.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Salvataggio non riuscito.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="grid gap-4 border-t border-slate-200 pt-6" aria-labelledby="marketplace-promotion-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Megaphone size={22} className="shrink-0 text-green" />
          <h3 id="marketplace-promotion-title" className="text-lg font-semibold text-ink">Promozione lead Marketplace</h3>
        </div>
        <button type="button" className="btn btn-secondary w-full sm:w-auto" disabled={loading || saving || !ready} onClick={() => void save()}>
          <Save size={17} />{saving ? "Salvataggio..." : "Salva promozione"}
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <span className={`text-sm font-semibold ${savedEnabled ? "text-green" : "text-muted"}`}>{savedEnabled ? "Attiva" : "Disattivata"}</span>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-ink">
          <input type="checkbox" className="size-5 accent-green" checked={enabled}
            disabled={loading || saving || !ready || (!enabled && (!engineReady || !compensationEnabled))}
            onChange={(event) => setEnabled(event.target.checked)} />
          Abilita promozione lead
        </label>
      </div>
      {ready && !engineReady ? <p role="alert" className="text-sm text-amber-800">Archivio compensi promozione non pronto.</p> : null}
      {ready && !compensationEnabled ? <p className="text-sm text-amber-800">Motore compensi generale disattivato.</p> : null}
      <fieldset disabled={loading || saving || !ready} className="grid min-w-0 gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-bold text-ink">
          Attesa dalla pubblicazione (minuti)
          <input className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-3 text-base font-semibold outline-none focus:border-green focus:ring-2 focus:ring-green/20 disabled:opacity-50" inputMode="numeric" value={minutes} onChange={(event) => setMinutes(event.target.value)} />
        </label>
        <label className="grid gap-2 text-sm font-bold text-ink">
          Compenso per lead venduto (EUR)
          <input className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-3 text-base font-semibold outline-none focus:border-green focus:ring-2 focus:ring-green/20 disabled:opacity-50" inputMode="decimal" value={euros} onChange={(event) => setEuros(event.target.value)} />
        </label>
      </fieldset>
      {loading ? <p className="text-sm text-muted" role="status">Caricamento promozioni...</p> : null}
      {error ? <p role="alert" className="text-sm font-semibold text-red-700">{error}</p> : null}
      {success ? <p role="status" className="text-sm font-semibold text-green">{success}</p> : null}
    </section>
  );
}
