"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, LoaderCircle, UserRoundX, X } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

type Blocker = {
  slug: "marketing" | "lead-host-prime";
  name: string;
  status: string;
  manageHref: string;
};

export function AccountDeactivationPanel() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function openDialog() {
    setOpen(true);
    setChecking(true);
    setError("");
    setBlockers([]);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Sessione scaduta. Effettua nuovamente il login.");
      const response = await fetch("/api/account/deactivate", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Verifica non riuscita.");
      setBlockers(payload.blockers ?? []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Verifica non riuscita.");
    } finally {
      setChecking(false);
    }
  }

  async function deactivate() {
    if (loading || confirmation !== "DISATTIVA ACCOUNT") return;
    setLoading(true);
    setError("");

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Sessione scaduta. Effettua nuovamente il login.");
      const response = await fetch("/api/account/deactivate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirmation, reason }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (payload.code === "ACTIVE_SUBSCRIPTIONS") setBlockers(payload.blockers ?? []);
        throw new Error(payload.error ?? "Disattivazione non riuscita.");
      }

      await supabase.auth.signOut({ scope: "global" }).catch(() => undefined);
      await fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
      window.location.assign("/login?account=deactivated");
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Disattivazione non riuscita.",
      );
      setLoading(false);
    }
  }

  return (
    <>
      <section className="card p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-red-50 text-red-700">
            <UserRoundX size={20} />
          </span>
          <h2 className="font-semibold text-ink">Disattivazione account</h2>
        </div>
        <p className="mt-4 text-sm leading-6 text-muted">
          Puoi disattivare autonomamente il tuo account. Saldo Wallet, acquisti, fatture e
          storico economico resteranno conservati; accesso e comunicazioni verranno bloccati.
        </p>
        <button className="btn btn-secondary mt-4 w-full text-red-700" type="button" onClick={() => void openDialog()}>
          Disattiva account
        </button>
      </section>

      {open ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/55 p-4" role="presentation">
          <section
            aria-labelledby="deactivation-title"
            aria-modal="true"
            className="relative max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-5 shadow-2xl sm:p-7"
            role="dialog"
          >
            <button
              aria-label="Chiudi"
              className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-lg border border-ink/10 bg-white"
              type="button"
              onClick={() => setOpen(false)}
            >
              <X size={20} />
            </button>
            <div className="pr-12">
              <p className="section-kicker text-red-700">Operazione account</p>
              <h2 className="mt-2 text-2xl font-semibold text-ink" id="deactivation-title">
                Disattiva il tuo account
              </h2>
            </div>

            {checking ? (
              <div className="mt-6 flex items-center gap-3 rounded-lg bg-slate-50 p-4 text-sm font-semibold text-muted">
                <LoaderCircle className="animate-spin" size={18} /> Verifico gli abbonamenti attivi...
              </div>
            ) : blockers.length ? (
              <div className="mt-6">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                  <p className="flex items-center gap-2 font-bold"><AlertTriangle size={18} /> Disattivazione bloccata</p>
                  <p className="mt-2">
                    Hai uno o più rinnovi automatici attivi. Annullali prima; resteranno utilizzabili
                    fino alla fine del periodo già pagato e poi potrai disattivare l’account.
                  </p>
                </div>
                <div className="mt-4 grid gap-3">
                  {blockers.map((blocker) => (
                    <div className="flex flex-col gap-3 rounded-lg border border-ink/10 p-4 sm:flex-row sm:items-center sm:justify-between" key={blocker.slug}>
                      <div>
                        <p className="font-semibold text-ink">{blocker.name}</p>
                        <p className="mt-1 text-xs text-muted">Rinnovo automatico attivo</p>
                      </div>
                      <a className="btn btn-secondary" href={blocker.manageHref} onClick={() => setOpen(false)}>
                        Gestisci abbonamento
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-6 grid gap-5">
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-900">
                  La disattivazione è immediata: verrai disconnesso da tutti i dispositivi e non
                  riceverai più notifiche o comunicazioni marketing. I dati economici non verranno cancellati.
                </div>
                <label className="grid gap-2 text-sm font-semibold text-ink">
                  Motivo della disattivazione <span className="font-normal text-muted">(facoltativo)</span>
                  <textarea
                    className="min-h-24 rounded-lg border border-ink/12 px-4 py-3 font-normal outline-none focus:border-red-400"
                    maxLength={500}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-ink">
                  Per confermare scrivi <span className="text-red-700">DISATTIVA ACCOUNT</span>
                  <input
                    autoComplete="off"
                    className="min-h-12 rounded-lg border border-ink/12 px-4 outline-none focus:border-red-400"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                </label>
                <button
                  className="btn min-h-12 bg-red-600 text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={loading || confirmation !== "DISATTIVA ACCOUNT"}
                  type="button"
                  onClick={() => void deactivate()}
                >
                  {loading ? <LoaderCircle className="animate-spin" size={18} /> : <UserRoundX size={18} />}
                  {loading ? "Disattivazione..." : "Conferma disattivazione"}
                </button>
              </div>
            )}

            {error ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
