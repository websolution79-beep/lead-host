"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, ShoppingBag } from "lucide-react";
import { formatCents } from "@/lib/config/commercial";
import type { PurchaseMode } from "@/lib/domain/lead-state";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

type LeadPurchaseActionsProps = {
  leadId: string;
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

export function LeadPurchaseActions({
  leadId,
  sharedAvailable,
  exclusiveAvailable,
  sharedPriceCents,
  exclusivePriceCents,
}: LeadPurchaseActionsProps) {
  const router = useRouter();
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [state, setState] = useState<PurchaseState>({ status: "idle" });

  async function purchaseLead(mode: PurchaseMode) {
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
      body: JSON.stringify({ leadId, mode }),
    });

    const result = (await response.json()) as {
      error?: string;
      code?: string;
      balanceCents?: number;
      missingAmountCents?: number;
    };

    if (!response.ok) {
      setState({
        status: "error",
        message: result.error ?? "Non e stato possibile completare l'acquisto.",
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
    router.refresh();
  }

  if (!sharedAvailable && !exclusiveAvailable) {
    return (
      <div className="rounded-lg bg-fog p-4 text-sm font-semibold text-muted">
        Questo lead non e piu disponibile per l&apos;acquisto.
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
          onClick={() => purchaseLead("shared")}
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
          onClick={() => purchaseLead("exclusive")}
        >
          <ShoppingBag size={17} />
          {loadingMode === "exclusive"
            ? "Acquisto in corso..."
            : `Acquista in esclusiva - ${formatCents(exclusivePriceCents)}`}
        </button>
      ) : null}

      {state.status === "error" ? (
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
    </div>
  );
}
