"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Save, Link2 } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { useAppSession } from "@/components/app-session-provider";
import type { MarketplaceMembershipSettings } from "@/lib/marketplace-membership/policy";

type Result = { settings?: MarketplaceMembershipSettings; activationAvailable?: boolean;
  storageReady?: boolean; error?: string; stripeProductId?: string | null };
const money = (cents: number) => new Intl.NumberFormat("it-IT", {
  style: "currency", currency: "EUR",
}).format(cents / 100);

export function AdminMarketplaceMembershipSettings() {
  const session = useAppSession();
  const db = useMemo(() => createPublicSupabaseClient(), []);
  const [list, setList] = useState("");
  const [promo, setPromo] = useState("");
  const [days, setDays] = useState("0");
  const [promoEnabled, setPromoEnabled] = useState(false);
  const [paidEnabled, setPaidEnabled] = useState(false);
  const [activationAvailable, setActivationAvailable] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [stripeProductId, setStripeProductId] = useState<string | null>(null);
  useEffect(() => {
    if (!session.isSuperAdmin) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await db.auth.getSession();
        const response = await fetch("/api/admin/settings/marketplace-membership", {
          headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` }, cache: "no-store",
        });
        const result: Result = await response.json();
        if (!response.ok || !result.settings || !result.storageReady) throw new Error(result.error ?? "Configurazione non disponibile.");
        if (cancelled) return;
        setList(result.settings.listPriceCents === null ? "" : (result.settings.listPriceCents / 100).toFixed(2));
        setPromo(result.settings.promoPriceCents === null ? "" : (result.settings.promoPriceCents / 100).toFixed(2));
        setDays(String(result.settings.trialDays));
        setPromoEnabled(result.settings.promoEnabled);
        setPaidEnabled(result.settings.paidAccessEnabled);
        setActivationAvailable(Boolean(result.activationAvailable));
        setStripeProductId(result.stripeProductId ?? null);
        setReady(true);
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Caricamento non riuscito."); }
    })();
    return () => { cancelled = true; };
  }, [db, session.isSuperAdmin]);

  async function connectStripe() {
    setSaving(true); setError(""); setSuccess("");
    try {
      const { data } = await db.auth.getSession();
      const response = await fetch("/api/admin/settings/marketplace-membership", {
        method: "POST", headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      });
      const result: Result = await response.json();
      if (!response.ok || !result.stripeProductId) throw new Error(result.error ?? "Collegamento Stripe non riuscito.");
      setStripeProductId(result.stripeProductId);
      setSuccess("Prodotto Marketplace collegato a Stripe. Gli acquisti restano disabilitati.");
    } catch (e) { setError(e instanceof Error ? e.message : "Collegamento non riuscito."); }
    finally { setSaving(false); }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setSuccess("");
    try {
      const { data } = await db.auth.getSession();
      const response = await fetch("/api/admin/settings/marketplace-membership", {
        method: "PATCH", headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`,
          "Content-Type": "application/json" },
        body: JSON.stringify({ paidAccessEnabled: paidEnabled, promoEnabled,
          listPriceCents: list === "" ? null : Math.round(Number(list) * 100),
          promoPriceCents: promo === "" ? null : Math.round(Number(promo) * 100), trialDays: Number(days) }),
      });
      const result: Result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Salvataggio non riuscito.");
      setSuccess("Configurazione Marketplace salvata.");
    } catch (e) { setError(e instanceof Error ? e.message : "Salvataggio non riuscito."); }
    finally { setSaving(false); }
  }
  const monthly = Number(promoEnabled ? promo : list);
  if (!session.isSuperAdmin) return <p>Impostazioni riservate al Super Admin.</p>;
  return <div className="min-w-0 space-y-6">
    <Link href="/admin/impostazioni" className="inline-flex items-center gap-2 text-sm font-semibold text-green"><ArrowLeft size={16} />Impostazioni</Link>
    <form onSubmit={save} className="min-w-0 space-y-6">
      <div className="border-b border-slate-200 pb-6">
        <h2 className="text-xl font-semibold text-ink">Accesso al Marketplace</h2>
        <label className="mt-4 flex items-start gap-3 font-semibold">
          <input type="checkbox" className="mt-1 size-4 accent-green" checked={paidEnabled}
            disabled={!ready || saving || !activationAvailable} onChange={e => setPaidEnabled(e.target.checked)} />
          Accesso a pagamento attivo
        </label>
        {!activationAvailable && <p className="mt-2 text-sm text-muted">Marketplace aperto. Attivazione a pagamento non ancora disponibile.</p>}
        <p className="mt-2 text-sm text-muted">Il Marketplace pubblico e incluso per i PM con accesso PRIME attivo.</p>
      </div>
      <fieldset disabled={!ready || saving} className="grid min-w-0 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-2 text-sm font-semibold">Listino mensile (EUR)
          <input className="input min-w-0 w-full" type="number" min="0.01" max="10000" step="0.01" value={list} onChange={e => setList(e.target.value)} placeholder="Da impostare" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">Prezzo promozionale mensile (EUR)
          <input className="input min-w-0 w-full" type="number" min="0.01" max="10000" step="0.01" value={promo} required={promoEnabled} onChange={e => setPromo(e.target.value)} placeholder="Facoltativo" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">Giorni di prova gratuita
          <input className="input min-w-0 w-full" type="number" min="0" max="365" step="1" required value={days} onChange={e => setDays(e.target.value)} />
        </label>
        <label className="flex items-center gap-3 text-sm font-semibold sm:col-span-2">
          <input type="checkbox" className="size-4 accent-green" checked={promoEnabled} onChange={e => setPromoEnabled(e.target.checked)} />Promozione attiva
        </label>
      </fieldset>
      <div className="border-y border-slate-200 py-5">
        <p className="text-sm text-muted">Canone per le nuove iscrizioni</p>
        <p className="mt-1 text-2xl font-semibold text-green">{monthly > 0 ? `${money(Math.round(monthly * 100))} / mese` : "Da impostare"}</p>
        <p className="mt-3 text-sm leading-6 text-muted">Il canone concordato resta valido per i rinnovi dell&apos;abbonamento. Le modifiche valgono per le nuove iscrizioni, incluse quelle in prova gratuita.</p>
        <p className="mt-2 text-sm leading-6 text-muted">La prova richiede un metodo di pagamento. Alla scadenza parte il canone concordato; 0 giorni indica nessuna prova.</p>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="text-sm text-green">{success}</p>}
      <div className="border-b border-slate-200 pb-5">
        <h2 className="text-lg font-semibold">Collegamento Stripe</h2>
        {stripeProductId ? <p className="mt-2 text-sm text-green">Marketplace Lead Host collegato.</p> :
          <button type="button" onClick={connectStripe} disabled={!ready || saving} className="btn btn-secondary mt-3 w-full sm:w-auto">
            <Link2 size={17} /> Crea e collega prodotto Stripe
          </button>}
      </div>
      <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={!ready || saving}><Save size={17} />{saving ? "Salvataggio..." : "Salva configurazione"}</button>
    </form>
  </div>;
}
