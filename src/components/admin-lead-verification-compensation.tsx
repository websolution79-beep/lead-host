"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeEuro, CheckCircle2 } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

type ClaimState = {
  featureEnabled: boolean;
  eligible: boolean;
  interested: boolean;
  claimed: boolean;
  ownClaim: boolean;
  claimedAt: string | null;
  claimantName: string | null;
  reason: string | null;
};

export function AdminLeadVerificationCompensation({
  ownerRequestId,
}: {
  ownerRequestId: string;
}) {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [state, setState] = useState<ClaimState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadState = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    const response = await fetch(
      `/api/admin/leads/${ownerRequestId}/verification-compensation`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );
    if (!response.ok) return;
    setState((await response.json()) as ClaimState);
  }, [getToken, ownerRequestId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadState(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadState]);

  async function confirmVerification() {
    if (!window.confirm("Confermi di aver verificato personalmente questo Lead? Il compenso verrà attribuito una sola volta.")) return;
    const token = await getToken();
    if (!token) return;
    setSaving(true);
    setError("");
    const response = await fetch(
      `/api/admin/leads/${ownerRequestId}/verification-compensation`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` } },
    );
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Conferma verifica non riuscita.");
    } else {
      await loadState();
    }
    setSaving(false);
  }

  if (!state?.featureEnabled) return null;

  return (
    <section className="mt-5 border-t border-slate-200 pt-5">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex gap-3">
          <BadgeEuro className="mt-0.5 shrink-0 text-green" size={20} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink">Compenso verifica Lead</p>
            {state.claimed ? (
              <p className="mt-1 text-sm text-emerald-800">
                Confermato da {state.claimantName ?? "membro Team"}.
              </p>
            ) : (
              <p className="mt-1 text-xs leading-5 text-muted">
                Conferma manualmente solo dopo aver verificato il Lead e averlo spostato in Interessato.
              </p>
            )}
          </div>
        </div>
        {!state.claimed ? (
          <button
            className="btn btn-primary mt-4 w-full"
            type="button"
            disabled={!state.eligible || saving}
            title={state.reason ?? undefined}
            onClick={() => void confirmVerification()}
          >
            <CheckCircle2 size={17} />
            {saving ? "Conferma..." : "Conferma Lead verificato"}
          </button>
        ) : null}
        {!state.eligible && !state.claimed && state.reason ? (
          <p className="mt-2 text-xs font-semibold text-amber-800">{state.reason}</p>
        ) : null}
        {error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
      </div>
    </section>
  );
}
