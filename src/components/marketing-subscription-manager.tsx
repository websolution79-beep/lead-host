"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, CreditCard, ExternalLink, Sparkles, X } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

type SubscriptionState = {
  product: {
    name: string;
    cancellationMode: "period_end" | "immediate";
  };
  subscription: {
    id: string;
    status: string;
    source: "stripe" | "manual";
    trialEndsAt: string | null;
    currentPeriodEndsAt: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
};

const statusLabels: Record<string, string> = {
  incomplete: "Attivazione in corso",
  trialing: "Prova gratuita",
  active: "Attivo",
  past_due: "Pagamento da aggiornare",
  paused: "In pausa",
  unpaid: "Pagamento non riuscito",
};

export function MarketingSubscriptionManager() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [state, setState] = useState<SubscriptionState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busyAction, setBusyAction] = useState<"portal" | "cancel" | "resume" | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadState = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      setLoaded(true);
      return;
    }

    const response = await fetch("/api/marketing/subscription", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }).catch(() => null);
    if (response?.ok) {
      setState((await response.json()) as SubscriptionState);
    }
    setLoaded(true);
  }, [getAccessToken]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadState(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadState]);

  async function runAction(action: "portal" | "cancel" | "resume") {
    setBusyAction(action);
    setError("");
    setMessage("");
    const token = await getAccessToken();
    if (!token) {
      setError("Sessione scaduta. Effettua nuovamente il login.");
      setBusyAction(null);
      return;
    }

    const response = await fetch("/api/marketing/subscription", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    const payload = response ? await response.json().catch(() => ({})) : {};

    if (!response?.ok) {
      setError(payload.error ?? "Non riesco a gestire l’abbonamento. Riprova tra poco.");
      setBusyAction(null);
      return;
    }

    if (action === "portal" && payload.portalUrl) {
      window.location.assign(payload.portalUrl);
      return;
    }

    setShowCancel(false);
    setMessage(payload.message ?? "Abbonamento aggiornato.");
    await loadState();
    setBusyAction(null);
  }

  if (!loaded || !state?.subscription) return null;

  const subscription = state.subscription;
  const relevantDate = subscription.trialEndsAt ?? subscription.currentPeriodEndsAt;
  const dateLabel = subscription.trialEndsAt ? "Fine prova" : "Prossimo rinnovo";
  const statusLabel = statusLabels[subscription.status] ?? subscription.status;
  const hasBillingProblem = subscription.status === "past_due" || subscription.status === "unpaid";

  return (
    <>
      <section className="card scroll-mt-28 p-5" id="abbonamento-marketing">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-green/10 text-green">
            <Sparkles size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase text-emerald-700">Abbonamento</p>
            <h2 className="mt-1 font-semibold text-ink">{state.product.name}</h2>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${
            hasBillingProblem ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
          }`}>
            {statusLabel}
          </span>
        </div>

        {relevantDate ? (
          <div className="mt-5 flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-3">
            <CalendarClock className="shrink-0 text-slate-500" size={18} />
            <div>
              <p className="text-xs font-semibold uppercase text-muted">{dateLabel}</p>
              <p className="mt-1 text-sm font-semibold text-ink">{formatDate(relevantDate)}</p>
            </div>
          </div>
        ) : null}

        {subscription.cancelAtPeriodEnd ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            La cancellazione è programmata. Potrai usare il modulo fino al termine del periodo indicato.
          </p>
        ) : null}
        {hasBillingProblem ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">
            Aggiorna il metodo di pagamento per evitare l’interruzione del servizio.
          </p>
        ) : null}
        {message ? (
          <p className="mt-4 rounded-lg border border-green/20 bg-green/8 px-4 py-3 text-sm font-semibold text-green">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}

        {subscription.source === "stripe" ? (
          <div className="mt-5 grid gap-3">
            <button
              className="btn btn-secondary w-full"
              disabled={busyAction !== null}
              type="button"
              onClick={() => void runAction("portal")}
            >
              <CreditCard size={17} />
              {busyAction === "portal" ? "Apertura..." : "Gestisci pagamento e fatture"}
              <ExternalLink size={15} />
            </button>
            {subscription.cancelAtPeriodEnd ? (
              <button
                className="btn btn-primary w-full"
                disabled={busyAction !== null}
                type="button"
                onClick={() => void runAction("resume")}
              >
                {busyAction === "resume" ? "Ripristino..." : "Mantieni l’abbonamento"}
              </button>
            ) : (
              <button
                className="min-h-11 rounded-lg border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                disabled={busyAction !== null}
                type="button"
                onClick={() => setShowCancel(true)}
              >
                Cancella abbonamento
              </button>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm leading-6 text-muted">
            Accesso assegnato manualmente dal team Lead Host. Non sono previsti addebiti ricorrenti.
          </p>
        )}
      </section>

      {showCancel ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/55 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="cancel-addon-title">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="section-kicker">Conferma cancellazione</p>
                <h2 className="mt-2 text-xl font-semibold text-ink" id="cancel-addon-title">
                  Vuoi cancellare il Modulo Marketing?
                </h2>
              </div>
              <button className="flex size-10 shrink-0 items-center justify-center rounded-lg hover:bg-slate-100" type="button" aria-label="Chiudi" onClick={() => setShowCancel(false)}>
                <X size={20} />
              </button>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted">
              {state.product.cancellationMode === "period_end"
                ? "Non ci saranno altri rinnovi. L’accesso resterà disponibile fino alla fine del periodo già attivo."
                : "L’accesso al modulo terminerà immediatamente e non ci saranno altri rinnovi."}
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button className="btn btn-secondary" type="button" onClick={() => setShowCancel(false)}>
                Mantieni abbonamento
              </button>
              <button className="min-h-12 rounded-lg bg-red-600 px-5 font-semibold text-white transition hover:bg-red-700" disabled={busyAction !== null} type="button" onClick={() => void runAction("cancel")}>
                {busyAction === "cancel" ? "Cancellazione..." : "Conferma cancellazione"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "long",
  }).format(new Date(value));
}
