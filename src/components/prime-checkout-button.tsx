"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CreditCard, Crown, X } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

export function PrimeCheckoutButton({
  startupLabel,
  renewalLabel,
  walletRechargeLabel,
  termsUrl,
}: {
  startupLabel: string;
  renewalLabel: string;
  walletRechargeLabel: string;
  termsUrl: string;
}) {
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

    const response = await fetch("/api/prime/checkout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ termsAccepted: true }),
    });
    const payload = (await response.json()) as {
      checkoutUrl?: string;
      error?: string;
      missingLabels?: string[];
    };
    if (!response.ok || !payload.checkoutUrl) {
      const missingDetails = payload.missingLabels?.length
        ? ` Controlla: ${payload.missingLabels.join(", ")}.`
        : "";
      setError(`${payload.error ?? "Non riesco ad avviare il checkout PRIME."}${missingDetails}`);
      setLoading(false);
      return;
    }
    window.location.assign(payload.checkoutUrl);
  }

  return (
    <>
      <button className="btn bg-amber-400 text-slate-950 hover:bg-amber-300" type="button" onClick={() => setOpen(true)}>
        <Crown size={18} fill="currentColor" />
        Attiva Lead Host PRIME
      </button>

      {open ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-5">
          <div className="w-full max-w-xl rounded-t-lg bg-white p-5 shadow-2xl sm:rounded-lg sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-extrabold uppercase text-amber-700">Lead Host PRIME</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">Conferma l’attivazione</h2>
              </div>
              <button className="icon-button shrink-0" type="button" aria-label="Chiudi" onClick={() => setOpen(false)}>
                <X size={19} />
              </button>
            </div>

            <div className="mt-5 grid gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-slate-700">
              <div className="flex justify-between gap-4"><span>Lead Host PRIME Startup</span><strong>{startupLabel}</strong></div>
              <div className="flex justify-between gap-4"><span>Servizio PRIME mensile</span><strong>{renewalLabel}</strong></div>
              <div className="flex justify-between gap-4"><span>Ricarica Wallet inclusa</span><strong>{walletRechargeLabel}</strong></div>
              <div className="border-t border-amber-200 pt-3 text-slate-950">
                Dal secondo mese: <strong>{renewalLabel}</strong> Membership + <strong>{walletRechargeLabel}</strong> Wallet.
              </div>
            </div>

            <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm leading-6 text-ink">
              <input className="mt-1 size-4 shrink-0 accent-amber-600" type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
              <span>
                Accetto i <Link className="font-semibold text-emerald-700 underline" href={termsUrl} target="_blank">Termini e Condizioni</Link> e il rinnovo mensile. La quota Wallet sarà accreditata dopo ogni pagamento riuscito.
              </span>
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
    </>
  );
}
