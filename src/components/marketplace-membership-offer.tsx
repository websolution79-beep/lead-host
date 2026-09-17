"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, CreditCard, Store } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

const money = (amount: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(amount / 100);

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
  return <section className="mx-auto w-full max-w-3xl space-y-6">
    <div className="flex items-center gap-3"><Store size={28} className="shrink-0 text-green" /><h2 className="text-2xl font-semibold">Le opportunita per i tuoi prossimi immobili</h2></div>
    <p className="leading-7 text-muted">Consulta i lead disponibili, valuta gli immobili e scegli quali contatti acquistare.</p>
    <ul className="space-y-3">
      {["Accesso al Marketplace pubblico", "Consultazione dei dettagli e delle stime disponibili", "Disdetta dei rinnovi dal tuo profilo"].map(item =>
        <li key={item} className="flex items-start gap-3"><Check size={20} className="mt-0.5 shrink-0 text-green" />{item}</li>)}
    </ul>
    <div className="space-y-4 border-y border-slate-200 py-6">
      {listPriceCents !== null && amountCents !== null && listPriceCents > amountCents && <p className="text-muted line-through">{money(listPriceCents)} / mese</p>}
      <p className="text-3xl font-semibold">{amountCents !== null ? `${money(amountCents)} / mese` : "Prezzo da configurare"}</p>
      {trialDays > 0 && <p className="font-semibold text-green">{trialDays} giorni di prova gratuita</p>}
      <p className="text-sm leading-6 text-muted">L&apos;abbonamento non include il costo dei lead o credito Wallet. Ogni lead si acquista separatamente.</p>
      {trialDays > 0 && <p className="text-sm leading-6 text-muted">Metodo di pagamento richiesto. Al termine della prova parte il canone indicato, salvo disdetta prima della scadenza.</p>}
      <p className="text-sm leading-6 text-muted">Il canone concordato resta valido per i rinnovi di questo abbonamento. Il Marketplace e incluso nell&apos;accesso PRIME attivo.</p>
    </div>
    {access === "required" && enabled ? <>
      <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-green" checked={accepted} onChange={e => setAccepted(e.target.checked)} disabled={busy} />
        <span>Accetto i <Link href="/termini" target="_blank" rel="noopener noreferrer" className="font-semibold text-green underline">Termini e Condizioni</Link> e il rinnovo mensile dell&apos;abbonamento.</span>
      </label>
      <button type="button" className="btn btn-primary w-full sm:w-auto" disabled={!accepted || busy} onClick={checkout}><CreditCard size={20} />{busy ? "Apertura checkout..." : trialDays > 0 ? "Inizia la prova gratuita" : "Abbonati al Marketplace"}</button>
    </> : <>
      <p role="status" className="font-semibold text-green">{access === "prime" ? "Marketplace incluso nel tuo PRIME" : access === "subscription" ? "Il tuo abbonamento e attivo" : access === "open" ? "Il Marketplace e attualmente aperto" : access === "staff" ? "Anteprima riservata al team" : "Attivazione abbonamenti non ancora disponibile"}</p>
      {access !== "required" && <Link className="btn btn-primary w-full sm:w-auto" href={access === "staff" ? "/admin/marketplace" : "/app/marketplace"}>Vai al Marketplace<ArrowRight size={18} /></Link>}
    </>}
    {error && <div role="alert" className="space-y-2 text-sm text-red-700"><p>{error}</p><Link href="/app/profilo" className="underline">Controlla il tuo profilo</Link></div>}
  </section>;
}
