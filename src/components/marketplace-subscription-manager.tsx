"use client";

import { useEffect, useMemo, useState } from "react";
import { Store, XCircle } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { useAppSession } from "@/components/app-session-provider";

type Subscription = { status: string; cancelAtPeriodEnd: boolean; periodEndsAt: string | null;
  monthlyPriceCents: number | null; canCancel: boolean };

export function MarketplaceSubscriptionManager() {
  const isPM = useAppSession().roles.includes("property_manager");
  const db = useMemo(() => createPublicSupabaseClient(), []);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!isPM) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await db.auth.getSession();
        const response = await fetch("/api/marketplace/subscription", { cache: "no-store",
          headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Abbonamento Marketplace non disponibile.");
        if (!cancelled) setSubscription(result.subscription);
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Errore caricamento abbonamento."); }
    })();
    return () => { cancelled = true; };
  }, [db, isPM]);

  async function cancel() {
    setBusy(true); setError("");
    try {
      const { data } = await db.auth.getSession();
      const response = await fetch("/api/marketplace/subscription", { method: "POST",
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Disdetta non riuscita.");
      setSubscription(s => s ? { ...s, cancelAtPeriodEnd: true, canCancel: false } : null);
      setMessage(result.message); setConfirm(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Disdetta non riuscita."); }
    finally { setBusy(false); }
  }
  if (!subscription && !error) return null;
  const end = subscription?.periodEndsAt ? new Date(subscription.periodEndsAt).toLocaleDateString("it-IT") : null;
  return <section id="abbonamento-marketplace" className="min-w-0 space-y-4 border-t border-slate-200 pt-6">
    <h2 className="flex items-center gap-2 text-xl font-semibold"><Store size={22} />Abbonamento Marketplace</h2>
    {subscription && <>
      <p className="text-sm text-muted">{subscription.status === "trialing" ? "Prova gratuita" : subscription.status === "incomplete" ? "Attivazione in corso" : "Abbonamento Marketplace"}
        {subscription.monthlyPriceCents !== null && ` - ${new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(subscription.monthlyPriceCents / 100)} / mese`}</p>
      {end && <p className="text-sm">{subscription.cancelAtPeriodEnd ? "Accesso fino al" : subscription.status === "trialing" ? "Fine prova" : "Prossimo rinnovo"}: {end}</p>}
      {subscription.cancelAtPeriodEnd && <p className="text-sm font-semibold text-green">Rinnovo automatico disattivato</p>}
      {subscription.canCancel && !confirm && <button type="button" className="btn btn-secondary w-full sm:w-auto" onClick={() => setConfirm(true)}><XCircle size={18} />Disdici rinnovo</button>}
      {confirm && <div className="space-y-3" role="group" aria-label="Conferma disdetta Marketplace">
        <p>Confermi la disdetta? Non ci saranno altri rinnovi. Potrai accedere fino alla scadenza del periodo corrente.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn btn-secondary w-full sm:w-auto" disabled={busy} onClick={() => setConfirm(false)}>Indietro</button>
          <button type="button" className="btn btn-primary w-full sm:w-auto" disabled={busy} onClick={cancel}>{busy ? "Disdetta in corso..." : "Conferma disdetta"}</button>
        </div>
      </div>}
    </>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="text-sm text-green">{message}</p>}
  </section>;
}
