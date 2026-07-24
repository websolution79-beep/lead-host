"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ShoppingBag,
  WalletCards,
  X,
} from "lucide-react";
import { formatCents } from "@/lib/config/commercial";
import type { PurchaseMode } from "@/lib/domain/lead-state";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { CURRENT_TERMS_VERSION } from "@/lib/legal/terms";

type LeadPurchaseActionsProps = {
  leadId: string;
  leadTitle: string;
  sharedAvailable: boolean;
  exclusiveAvailable: boolean;
  sharedPriceCents: number;
  exclusivePriceCents: number;
};

type PurchaseState =
  | { status: "idle" }
  | { status: "loading"; mode: PurchaseMode }
  | { status: "success"; leadId: string; balanceCents: number }
  | {
      status: "error";
      message: string;
      code?: string;
      missingAmountCents?: number;
    };

type PurchaseConfirmation = {
  mode: PurchaseMode;
  amountCents: number;
  termsAccepted: boolean;
};

export function LeadPurchaseActions({
  leadId,
  leadTitle,
  sharedAvailable,
  exclusiveAvailable,
  sharedPriceCents,
  exclusivePriceCents,
}: LeadPurchaseActionsProps) {
  const router = useRouter();
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [state, setState] = useState<PurchaseState>({ status: "idle" });
  const [confirmation, setConfirmation] =
    useState<PurchaseConfirmation | null>(null);

  useEffect(() => {
    if (!confirmation) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && state.status !== "loading") {
        setConfirmation(null);
        setState({ status: "idle" });
      }
    }

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [confirmation, state.status]);

  function openConfirmation(mode: PurchaseMode) {
    setState({ status: "idle" });
    setConfirmation({
      mode,
      amountCents:
        mode === "exclusive" ? exclusivePriceCents : sharedPriceCents,
      termsAccepted: false,
    });
  }

  function closeConfirmation() {
    if (state.status === "loading") return;

    setConfirmation(null);
    setState({ status: "idle" });
  }

  async function purchaseLead() {
    if (!confirmation?.termsAccepted) return;

    const { mode, amountCents } = confirmation;
    setState({ status: "loading", mode });

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setState({
        status: "error",
        message: "Sessione scaduta. Effettua di nuovo il login per acquistare il lead.",
      });
      return;
    }

    const response = await fetch("/api/purchases/wallet", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        leadId,
        mode,
        expectedAmountCents: amountCents,
        termsAccepted: true,
        termsVersion: CURRENT_TERMS_VERSION,
      }),
    });

    const result = (await response.json()) as {
      error?: string;
      code?: string;
      balanceCents?: number;
      missingAmountCents?: number;
      currentAmountCents?: number;
    };

    if (!response.ok) {
      if (
        result.code === "PRICE_CHANGED" &&
        typeof result.currentAmountCents === "number"
      ) {
        setConfirmation({
          mode,
          amountCents: result.currentAmountCents,
          termsAccepted: false,
        });
      }

      if (result.code === "TERMS_VERSION_CHANGED") {
        setConfirmation((current) =>
          current ? { ...current, termsAccepted: false } : current,
        );
      }

      setState({
        status: "error",
        message: result.error ?? "Non è stato possibile completare l'acquisto.",
        code: result.code,
        missingAmountCents: result.missingAmountCents,
      });
      return;
    }

    setState({
      status: "success",
      leadId,
      balanceCents: result.balanceCents ?? 0,
    });
    setConfirmation(null);
    router.refresh();
  }

  if (!sharedAvailable && !exclusiveAvailable) {
    return (
      <div className="rounded-lg bg-fog p-4 text-sm font-semibold text-muted">
        Questo lead non è più disponibile per l&apos;acquisto.
      </div>
    );
  }

  if (state.status === "success") {
    return (
      <div className="rounded-xl border border-green/20 bg-green/10 p-4">
        <p className="flex items-center gap-2 font-semibold text-green">
          <CheckCircle2 size={18} />
          Lead acquistato e contatti sbloccati
        </p>
        <p className="mt-2 text-sm leading-6 text-ink">
          Il credito e stato scalato dal wallet. Puoi aprire subito il dettaglio
          completo da I miei lead.
        </p>
        <Link className="btn btn-primary mt-4 w-full" href={`/app/i-miei-lead/${leadId}`}>
          Apri lead sbloccato
        </Link>
      </div>
    );
  }

  const loadingMode = state.status === "loading" ? state.mode : null;

  return (
    <div className="grid gap-3">
      {sharedAvailable ? (
        <button
          className="btn btn-primary w-full"
          type="button"
          disabled={Boolean(loadingMode)}
          onClick={() => openConfirmation("shared")}
        >
          <ShoppingBag size={17} />
          {loadingMode === "shared"
            ? "Acquisto in corso..."
            : `Acquista condiviso - ${formatCents(sharedPriceCents)}`}
        </button>
      ) : null}

      {exclusiveAvailable ? (
        <button
          className="btn btn-secondary w-full"
          type="button"
          disabled={Boolean(loadingMode)}
          onClick={() => openConfirmation("exclusive")}
        >
          <ShoppingBag size={17} />
          {loadingMode === "exclusive"
            ? "Acquisto in corso..."
            : `Acquista in esclusiva - ${formatCents(exclusivePriceCents)}`}
        </button>
      ) : null}

      {state.status === "error" && !confirmation ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">
          <p className="flex items-center gap-2 font-semibold">
            <AlertCircle size={18} />
            {state.message}
          </p>
          {state.code === "INSUFFICIENT_CREDIT" ? (
            <>
              {state.missingAmountCents ? (
                <p className="mt-2">
                  Mancano {formatCents(state.missingAmountCents)} per completare
                  l&apos;acquisto.
                </p>
              ) : null}
              <Link className="btn btn-secondary mt-3 w-full" href="/app/acquisti">
                Vai al wallet
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      {confirmation ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-5"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeConfirmation();
          }}
        >
          <section
            aria-labelledby="purchase-confirmation-title"
            aria-modal="true"
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-xl sm:p-6"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="section-kicker">Conferma acquisto</p>
                <h2
                  className="mt-2 text-2xl font-semibold text-ink"
                  id="purchase-confirmation-title"
                >
                  {leadTitle}
                </h2>
              </div>
              <button
                aria-label="Chiudi"
                className="grid size-10 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-slate-300 hover:text-ink"
                disabled={state.status === "loading"}
                type="button"
                onClick={closeConfirmation}
              >
                <X size={19} />
              </button>
            </div>

            <dl className="mt-6 grid gap-3 rounded-xl bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-sm font-semibold text-muted">Modalità</dt>
                <dd className="font-semibold text-ink">
                  {confirmation.mode === "exclusive" ? "Esclusiva" : "Condivisa"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-3">
                <dt className="text-sm font-semibold text-muted">Importo</dt>
                <dd className="text-xl font-bold text-ink">
                  {formatCents(confirmation.amountCents)}
                </dd>
              </div>
            </dl>

            <p className="mt-4 flex items-start gap-3 rounded-xl border border-green/15 bg-green/8 p-4 text-sm leading-6 text-slate-700">
              <WalletCards className="mt-0.5 shrink-0 text-green" size={19} />
              L&apos;importo verrà scalato dal tuo Wallet Lead Host.
            </p>

            <p className="mt-4 text-sm leading-6 text-muted">
              Stai acquistando l&apos;accesso ai dati di contatto associati a questa
              richiesta. Lead Host non garantisce la risposta del proprietario, la
              conclusione di un appuntamento o l&apos;affidamento dell&apos;immobile.
            </p>

            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm leading-6 text-slate-700">
              <input
                className="mt-1 size-4 shrink-0 accent-green"
                type="checkbox"
                checked={confirmation.termsAccepted}
                onChange={(event) =>
                  setConfirmation((current) =>
                    current
                      ? { ...current, termsAccepted: event.target.checked }
                      : current,
                  )
                }
              />
              <span>
                Confermo di aver letto e accettato le{" "}
                <Link
                  className="font-semibold text-green underline underline-offset-2"
                  href="/termini"
                  target="_blank"
                >
                  Condizioni del Servizio
                </Link>{" "}
                e le condizioni applicabili all&apos;acquisto del Lead.
              </span>
            </label>

            {state.status === "error" ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">
                <p className="flex items-start gap-2 font-semibold">
                  <AlertCircle className="mt-0.5 shrink-0" size={18} />
                  {state.message}
                </p>
                {state.code === "PRICE_CHANGED" ? (
                  <p className="mt-2 font-semibold">
                    Nuovo prezzo: {formatCents(confirmation.amountCents)}. Se desideri
                    procedere, accetta nuovamente le condizioni.
                  </p>
                ) : null}
                {state.code === "INSUFFICIENT_CREDIT" ? (
                  <Link className="btn btn-secondary mt-3 w-full" href="/app/acquisti">
                    Vai al wallet
                  </Link>
                ) : null}
              </div>
            ) : null}

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                className="btn btn-secondary"
                disabled={state.status === "loading"}
                type="button"
                onClick={closeConfirmation}
              >
                Annulla
              </button>
              <button
                className="btn btn-primary"
                disabled={
                  !confirmation.termsAccepted || state.status === "loading"
                }
                type="button"
                onClick={purchaseLead}
              >
                <ShoppingBag size={17} />
                {state.status === "loading"
                  ? "Acquisto in corso..."
                  : "Conferma acquisto"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
