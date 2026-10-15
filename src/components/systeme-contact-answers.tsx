"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileInput, Loader2, Plus, RefreshCw } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { systemeContactFieldsSchema } from "@/lib/marketing/systeme/flows";
import type { z } from "zod";

export function SystemeContactAnswers({ contactId }: { contactId: string }) {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [fields, setFields] = useState<z.infer<typeof systemeContactFieldsSchema>["fields"] | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Sessione scaduta.");
      const response = await fetch(`/api/marketing/crm/systeme-fields?contactId=${encodeURIComponent(contactId)}&page=${page}`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: "no-store", signal,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Risposte importate non disponibili.");
      const parsed = systemeContactFieldsSchema.parse(payload);
      if (!signal.aborted) {
        setFields((current) => page === 1 ? parsed.fields : [...(current ?? []), ...parsed.fields.filter((field) => !current?.some((previous) => previous.id === field.id))]);
        setTotal(parsed.total); setError("");
      }
    } catch (error) { if (!signal.aborted) setError(error instanceof Error ? error.message : "Risposte importate non disponibili."); }
    finally { if (!signal.aborted) setLoading(false); }
  }, [contactId, supabase, page]);
  useEffect(() => {
    const controller = new AbortController(); const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load, retry]);
  if (fields?.length === 0 && !error && !loading) return null;
  return <section className="min-w-0 border-y border-slate-200 py-4" aria-label="Risposte da Systeme.io">
    <h3 className="flex items-center gap-2 font-semibold text-ink"><FileInput size={18} className="text-green" />Risposte da Systeme.io</h3>
    {error ? <div className="mt-3 space-y-2"><p role="alert" className="text-sm text-red-700">{error}</p><button type="button" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-green" disabled={loading} onClick={() => { setLoading(true); setRetry((value) => value + 1); }}><RefreshCw size={16} />Riprova</button></div> : null}
    {fields ? <dl className="mt-4 min-w-0 space-y-4">{fields.map((field) => <div key={field.id} className="min-w-0">
        <dt className="break-words text-sm font-semibold text-ink [overflow-wrap:anywhere]">{field.label}{field.flowName ? <span className="ml-2 font-normal text-muted">({field.flowName})</span> : null}</dt>
        <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-muted [overflow-wrap:anywhere]">{field.value}</dd>
      </div>)}</dl> : null}
    {loading ? <p role="status" className="mt-3 flex items-center gap-2 text-sm text-muted"><Loader2 size={16} className="animate-spin" />Caricamento risposte...</p> : null}
    {fields && fields.length < total && !error ? <button type="button" disabled={loading} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-green"
      onClick={() => { setLoading(true); setPage((value) => value + 1); }}><Plus size={16} />Mostra altre risposte ({fields.length}/{total})</button> : null}
  </section>;
}
