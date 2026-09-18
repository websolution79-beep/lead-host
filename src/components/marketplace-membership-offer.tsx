"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, CreditCard, Store, SlidersHorizontal, MapPin, BedDouble, Bath } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

const money = (amount: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: amount % 100 === 0 ? 0 : 2 }).format(amount / 100);

// Only illustrative content: protected lead data must never be sent behind a CSS blur.
function MarketplaceBackdrop() {
  return <div aria-hidden="true" inert className="pointer-events-none absolute inset-0 select-none overflow-hidden" style={{ filter: "blur(6px)", opacity: 0.55 }}>
    <div className="mb-6 flex flex-wrap items-center gap-5 rounded-lg border border-slate-200 bg-white p-5">
      <SlidersHorizontal className="text-green" />
      {["Regione", "Provincia", "Citta", "Tipologia Lead", "Disponibilita"].map(label => <div key={label} className="min-w-24 flex-1 text-sm font-semibold">{label}<div className="mt-2 rounded-lg border border-slate-200 p-3">Tutti</div></div>)}
    </div>
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 9 }, (_, i) => <div key={i} className="space-y-5 rounded-lg border border-emerald-300 bg-white p-5">
        <div className="flex justify-between text-sm font-semibold text-green"><span>APPARTAMENTO</span><span>Disponibile</span></div>
        <div className="h-5 w-28 rounded bg-blue-100" />
        <p className="text-xl font-semibold">Nuova opportunita immobiliare</p>
        <div className="flex items-center gap-2 text-muted"><MapPin size={18} /><div className="h-3 w-36 rounded bg-slate-200" /></div>
        <div className="flex gap-12 text-muted"><BedDouble size={18} /><Bath size={18} /></div>
        <p className="text-xs font-semibold text-muted">SERVIZI RICHIESTI</p>
        <div className="h-6 w-36 rounded bg-slate-100" />
        <div className="h-14 rounded-lg border border-slate-200 bg-slate-50" />
        <div className="rounded-lg border border-slate-200 p-3 text-center font-semibold">Vedi dettaglio</div>
      </div>)}
    </div>
  </div>;
}

export function MarketplaceMembershipOffer({ amountCents, listPriceCents, trialDays, enabled, access }: {
  amountCents: number | null; listPriceCents: number | null; trialDays: number;
  enabled: boolean; access: "open" | "prime" | "subscription" | "required" | "staff";
}) {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function checkout() {
    if (!enabled || !accepted || busy) return;
    setBusy(true); setError("");
    try {
      const { data } = await createPublicSupabaseClient().auth.getSession();
      const response = await fetch("/api/marketplace/checkout", { method: "POST",
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ termsAccepted: true }) });
      const result = await response.json();
      if (!response.ok || !result.checkoutUrl) throw new Error(result.error ?? "Checkout non disponibile.");
      window.location.assign(result.checkoutUrl);
    } catch (e) { setError(e instanceof Error ? e.message : "Riprova tra poco."); setBusy(false); }
  }
  const canCheckout = access === "required" && enabled;
  return <section className="relative isolate w-full min-w-0 overflow-hidden rounded-lg px-2 py-6 sm:px-6 sm:py-12" aria-labelledby="marketplace-offer-title">
    <MarketplaceBackdrop />
    <div className="absolute inset-0 -z-10 bg-white/40" />
    <div className="relative mx-auto w-full max-w-xl space-y-5 rounded-lg border border-emerald-400 bg-white p-5 shadow-[0_16px_60px_-20px_rgba(5,150,105,0.3)] sm:p-8">
      <div className="text-center">
        <Store size={28} className="mx-auto mb-3 text-green" />
        <h2 id="marketplace-offer-title" className="text-2xl font-bold leading-tight sm:text-3xl">{trialDays > 0 ? <>Prova il Marketplace <span className="text-green">GRATIS per {trialDays} giorni</span></> : "Accedi al Marketplace Lead Host"}</h2>
        <p className="mt-3 text-sm leading-6 text-muted">{trialDays > 0 ? "Continua ad accedere a tutte le opportunita Lead Host e prova il nuovo Marketplace senza pagare nulla oggi." : "Accedi a tutte le opportunita Lead Host e scegli gli immobili che ti interessano."}</p>
      </div>
      <ul className="space-y-3 text-sm sm:text-base">
        {[trialDays > 0 ? `Accesso completo per ${trialDays} giorni` : "Accesso completo al Marketplace", "Visualizza tutte le nuove opportunita", "Acquista solo i lead che ti interessano", "Nessun vincolo di permanenza"].map(item =>
          <li key={item} className="flex items-start gap-3"><Check size={20} className="mt-0.5 shrink-0 text-green" />{item}</li>)}
      </ul>
      <div className="space-y-2 border-y border-emerald-100 py-4 text-center">
        {trialDays > 0 && <p className="text-sm text-muted">Dopo i {trialDays} giorni, se vorrai continuare:</p>}
        <p className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1">
          <strong className="text-3xl text-green">{amountCents !== null ? `${money(amountCents)}/mese` : "Prezzo da configurare"}</strong>
          {listPriceCents !== null && amountCents !== null && listPriceCents > amountCents && <span className="text-sm text-muted">invece di <s>{money(listPriceCents)}/mese</s></span>}
        </p>
        <p className="text-sm">Puoi annullare quando vuoi.</p>
      </div>
      {canCheckout && <>
      <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-green" checked={accepted} onChange={e => setAccepted(e.target.checked)} disabled={busy} />
        <span>Accetto i <Link href="/termini" target="_blank" rel="noopener noreferrer" className="font-semibold text-green underline">Termini e Condizioni</Link> e il rinnovo mensile dell&apos;abbonamento.</span>
      </label>
      </>}
      <div className="space-y-2 text-center">
        <button type="button" className="btn btn-primary w-full !whitespace-normal !px-3 !py-4 text-sm" disabled={!canCheckout || !accepted || busy} onClick={checkout}><CreditCard size={20} className="shrink-0" /><span>{busy ? "Apertura checkout..." : trialDays > 0 ? `INIZIA I ${trialDays} GIORNI GRATIS` : "ABBONATI AL MARKETPLACE"}</span></button>
        {trialDays > 0 && <p className="text-xs text-muted">Oggi non paghi nulla.</p>}
      </div>
      <p className="text-xs leading-5 text-muted">{trialDays > 0 ? "Metodo di pagamento richiesto. Al termine della prova il rinnovo e automatico al canone indicato, salvo disdetta prima della scadenza." : "Abbonamento con rinnovo mensile automatico, disattivabile dal profilo."} Il costo dei singoli lead non e incluso.</p>
      {!canCheckout && <div className="space-y-2 border-t border-slate-100 pt-3 text-center text-sm">
        <p role="status" className="text-muted">{access === "prime" ? "Marketplace incluso nel tuo PRIME" : access === "subscription" ? "Il tuo abbonamento e attivo" : access === "open" ? "Il Marketplace e attualmente aperto" : access === "staff" ? "Anteprima riservata al team: acquisto disabilitato" : "Attivazione abbonamenti non ancora disponibile"}</p>
        {access !== "required" && <Link className="inline-flex items-center gap-2 font-semibold text-green" href={access === "staff" ? "/admin/marketplace" : "/app/marketplace"}>Vai al Marketplace<ArrowRight size={16} /></Link>}
      </div>}
    {error && <div role="alert" className="space-y-2 text-sm text-red-700"><p>{error}</p><Link href="/app/profilo" className="underline">Controlla il tuo profilo</Link></div>}
    </div>
  </section>;
}
