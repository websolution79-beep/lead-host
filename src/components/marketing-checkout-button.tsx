"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CreditCard, LockKeyhole, X } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

type MarketingCheckoutButtonProps = {
  checkoutEnabled: boolean;
  compact?: boolean;
  priceLabel: string;
  termsUrl: string;
  trialDays: number;
};

export function MarketingCheckoutButton({
  checkoutEnabled,
  compact = false,
  priceLabel,
  termsUrl,
  trialDays,
}: MarketingCheckoutButtonProps) {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function startCheckout() {
    if (!accepted || loading) return;
    setLoading(true);
    setError("");

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setError("Sessione non disponibile. Effettua nuovamente il login.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/marketing/checkout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ termsAccepted: true }),
    });
    const payload = (await response.json()) as { checkoutUrl?: string; error?: string; code?: string };

    if (!response.ok || !payload.checkoutUrl) {
      setError(payload.error ?? "Non riesco ad avviare il checkout.");
      setLoading(false);
      return;
    }

    window.location.assign(payload.checkoutUrl);
  }

  const buttonLabel = trialDays > 0
    ? `Prova gratis per ${trialDays} giorni`
    : "Attiva il Modulo Marketing";

  return (
    <div className={compact ? "mt-6" : "mt-7"}>
      <button
        className="btn btn-primary w-full sm:w-auto"
        type="button"
        disabled={!checkoutEnabled}
        onClick={() => setOpen(true)}
      >
        <LockKeyhole size={17} />
        {checkoutEnabled ? buttonLabel : "Attivazione disponibile a breve"}
      </button>
      <p className="mt-3 text-sm text-muted">
        {checkoutEnabled
          ? `${priceLabel} al mese dopo la prova. Puoi annullare il rinnovo.`
          : "L’attivazione online sarà disponibile a breve."}
      </p>

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-5">
          <div className="w-full max-w-lg rounded-t-lg bg-white p-5 shadow-2xl sm:rounded-lg sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase text-emerald-700">Modulo Marketing</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">Conferma la prova gratuita</h2>
              </div>
              <button className="icon-button shrink-0" type="button" aria-label="Chiudi" onClick={() => setOpen(false)}>
                <X size={19} />
              </button>
            </div>
            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-muted">
              {trialDays > 0 ? (
                <p>Non verrà effettuato alcun addebito per i primi <strong className="text-ink">{trialDays} giorni</strong>.</p>
              ) : null}
              <p className={trialDays > 0 ? "mt-2" : ""}>Successivamente l’abbonamento costerà <strong className="text-ink">{priceLabel} al mese</strong> fino alla cancellazione.</p>
            </div>
            <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm leading-6 text-ink">
              <input className="mt-1 size-4 shrink-0 accent-emerald-700" type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
              <span>Accetto i <Link className="font-semibold text-emerald-700 underline" href={termsUrl} target="_blank">Termini e Condizioni</Link> e il rinnovo mensile dell’abbonamento.</span>
            </label>
            {error ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                {error}
                {error.toLowerCase().includes("fatturazione") ? (
                  <Link className="mt-2 block underline" href="/app/profilo#fatturazione">Vai ai dati di fatturazione</Link>
                ) : null}
              </div>
            ) : null}
            <button className="btn btn-primary mt-6 w-full" type="button" disabled={!accepted || loading} onClick={() => void startCheckout()}>
              <CreditCard size={17} />
              {loading ? "Apro Stripe..." : "Continua su Stripe"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
