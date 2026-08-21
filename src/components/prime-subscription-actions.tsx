"use client";

import { useEffect, useMemo, useState } from "react";
import { CreditCard, RotateCcw, XCircle } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

type SubscriptionState = {
  status: string;
  source: "stripe" | "manual";
  currentPeriodEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
};

export function PrimeSubscriptionActions({ variant = "inline" }: { variant?: "inline" | "card" }) {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void request("GET").then((payload) => setSubscription(payload.subscription ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function request(method: "GET" | "POST", action?: "portal" | "cancel" | "resume") {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sessione non disponibile.");
    const response = await fetch("/api/prime/subscription", {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(action ? { body: JSON.stringify({ action }) } : {}),
    });
    const payload = (await response.json()) as {
      subscription?: SubscriptionState | null;
      portalUrl?: string;
      message?: string;
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error ?? "Operazione PRIME non riuscita.");
    return payload;
  }

  async function act(action: "portal" | "cancel" | "resume") {
    if (loading) return;
    if (action === "cancel" && !window.confirm("Vuoi annullare il rinnovo PRIME a fine periodo?")) return;
    setLoading(true);
    setMessage("");
    try {
      const payload = await request("POST", action);
      if (payload.portalUrl) window.location.assign(payload.portalUrl);
      else {
        setMessage(payload.message ?? "Impostazione aggiornata.");
        const refreshed = await request("GET");
        setSubscription(refreshed.subscription ?? null);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operazione non riuscita.");
    } finally {
      setLoading(false);
    }
  }

  if (!subscription) return null;
  if (subscription.source === "manual") {
    return (
      <PrimeShell variant={variant}>
        <p className="text-sm font-semibold text-ink">Accesso PRIME attivo</p>
        <p className="mt-2 text-xs text-amber-900">Accesso gestito manualmente dal team Lead Host.</p>
      </PrimeShell>
    );
  }

  return (
    <PrimeShell variant={variant}>
      <div className={variant === "inline" ? "mt-4 border-t border-amber-200 pt-4" : ""}>
      {variant === "card" ? (
        <div className="mb-4">
          <p className="section-kicker">Abbonamento</p>
          <h2 className="mt-2 font-semibold text-ink">Lead Host PRIME</h2>
          <p className="mt-1 text-xs font-semibold text-green">{subscriptionStatusLabel(subscription.status)}</p>
        </div>
      ) : null}
      <p className="text-xs text-amber-900">
        {subscription.cancelAtPeriodEnd
          ? `Rinnovo annullato${subscription.currentPeriodEndsAt ? ` dal ${formatDate(subscription.currentPeriodEndsAt)}` : ""}.`
          : `Rinnovo attivo${subscription.currentPeriodEndsAt ? ` il ${formatDate(subscription.currentPeriodEndsAt)}` : ""}.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn btn-secondary px-3 py-2 text-xs" type="button" disabled={loading} onClick={() => void act("portal")}>
          <CreditCard size={15} /> Gestisci pagamento
        </button>
        {subscription.cancelAtPeriodEnd ? (
          <button className="btn btn-secondary px-3 py-2 text-xs" type="button" disabled={loading} onClick={() => void act("resume")}>
            <RotateCcw size={15} /> Ripristina rinnovo
          </button>
        ) : (
          <button className="btn px-3 py-2 text-xs text-red-700" type="button" disabled={loading} onClick={() => void act("cancel")}>
            <XCircle size={15} /> Annulla a fine periodo
          </button>
        )}
      </div>
      {message ? <p className="mt-3 text-xs font-semibold text-amber-950">{message}</p> : null}
      </div>
    </PrimeShell>
  );
}

function PrimeShell({ variant, children }: { variant: "inline" | "card"; children: React.ReactNode }) {
  if (variant === "inline") return <>{children}</>;
  return <section className="card scroll-mt-28 border border-green/20 bg-green/5 p-5" id="abbonamento-prime">{children}</section>;
}

function subscriptionStatusLabel(status: string) {
  if (status === "active") return "Abbonamento attivo";
  if (status === "past_due") return "Pagamento da aggiornare";
  if (status === "unpaid") return "Pagamento non riuscito";
  return status;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "long" }).format(new Date(value));
}
