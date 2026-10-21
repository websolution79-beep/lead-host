"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRightLeft, RefreshCw } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { getLeadAccessToken } from "@/lib/auth/lead-access-token";
import { useAppSession } from "@/components/app-session-provider";

type Stage = { id: string; name: string };

export function AdminLeadPipelineMove({ currentStageId, disabled, onMove }: {
  currentStageId: string | null;
  disabled: boolean;
  onMove: (stageId: string) => Promise<void>;
}) {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const { userId } = useAppSession();
  const id = useId();
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selection, setSelection] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const pending = useRef(false);
  const destination = selection ?? currentStageId ?? "";

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const token = await getLeadAccessToken(supabase, userId);
        if (controller.signal.aborted) return;
        if (!token) throw new Error("Sessione scaduta. Accedi in un'altra scheda e ricarica le fasi.");
        const response = await fetch("/api/admin/leads/pipeline", { cache: "no-store", signal: controller.signal,
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json() as { stages?: Stage[]; error?: string };
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(payload.error ?? "Non riesco a caricare le fasi.");
        if (!Array.isArray(payload.stages) || !payload.stages.length) throw new Error("Nessuna fase disponibile. Ricarica le fasi.");
        setStages(payload.stages);
      } catch (cause) {
        if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : "Non riesco a caricare le fasi.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [supabase, reload, userId]);

  async function move() {
    const stage = stages.find((item) => item.id === destination);
    if (!stage || destination === currentStageId || disabled || pending.current) return;
    pending.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await onMove(stage.id);
      setSelection(null);
      setNotice(`Lead spostato in ${stage.name}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Spostamento non riuscito. Riprova.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return <section aria-label="Spostamento nella pipeline" className="my-4 min-w-0 border-y border-slate-200 py-4">
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
      <label htmlFor={id} className="grid min-w-0 flex-1 gap-2 text-sm font-semibold text-ink">
        Fase della pipeline
        <select id={id} className="form-input min-h-12 w-full min-w-0" value={destination}
          disabled={disabled || loading || saving || Boolean(loadError)}
          onChange={(event) => { setSelection(event.target.value); setNotice(""); setError(""); }}>
          {!stages.some((stage) => stage.id === destination) ? <option value={destination}>{loading ? "Caricamento fasi..." : destination ? "Fase attuale non disponibile" : "Seleziona una fase"}</option> : null}
          {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
        </select>
      </label>
      <button type="button" className="btn btn-primary min-h-12 w-full shrink-0 sm:w-auto"
        disabled={disabled || saving || loading || Boolean(loadError) || !stages.some((stage) => stage.id === destination) || destination === currentStageId}
        onClick={() => void move()}><ArrowRightLeft size={17} />{saving ? "Spostamento..." : "Sposta"}</button>
    </div>
    {loadError ? <div className="mt-3 flex items-start justify-between gap-3 text-sm text-red-700" role="alert"><p className="min-w-0 break-words">{loadError}</p><button type="button" className="icon-button shrink-0" aria-label="Ricarica fasi" title="Ricarica fasi" disabled={loading || disabled} onClick={() => setReload((value) => value + 1)}><RefreshCw size={17} /></button></div> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
    {notice ? <p role="status" className="mt-3 text-sm font-semibold text-green">{notice}</p> : null}
  </section>;
}
