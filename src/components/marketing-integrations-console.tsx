"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Check, CheckCircle2, Copy, ExternalLink, KeyRound, Loader2, Plus, PlugZap, RefreshCw } from "lucide-react";
import { SystemeFlowsConsole } from "@/components/systeme-flows-console";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { systemeReasonLabels, type SystemeSettingsState } from "@/lib/marketing/systeme/settings";
import { leadHostProBrand } from "@/lib/marketing/leadhostpro";

const endpoint = "/api/marketing/integrations/systeme";
type SettingsResponse = SystemeSettingsState & { oneTimeSecret?: string; error?: string };

export function MarketingIntegrationsConsole() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [data, setData] = useState<SystemeSettingsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [flowBusy, setFlowBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [oneTimeSecret, setOneTimeSecret] = useState("");
  const [confirmRotation, setConfirmRotation] = useState(false);
  const [copied, setCopied] = useState("");
  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("Sessione scaduta. Effettua nuovamente l'accesso.");
    return data.session.access_token;
  }, [supabase]);

  const call = useCallback(async (method = "GET", body?: unknown) => {
    const token = await getToken();
    const response = await fetch(endpoint, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store",
    });
    const payload = await response.json() as SettingsResponse;
    if (!response.ok) throw new Error(payload.error ?? "Non riesco a caricare il collegamento. Riprova.");
    return payload;
  }, [getToken]);

  const load = useCallback(async () => {
    try {
      const payload = await call();
      setData(payload); setError("");
    } catch (error) { setError(error instanceof Error ? error.message : "Collegamento non disponibile."); }
    finally { setLoading(false); }
  }, [call]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function refresh() {
    setBusy(true); setError(""); setMessage("");
    try {
      const payload = await call();
      setData(payload);
      setMessage(payload.events.length ? "Ricezione aggiornata." : "Nessun invio ancora ricevuto. Compila il form della tua landing per fare una prova.");
    } catch (error) { setError(error instanceof Error ? error.message : "Aggiornamento non riuscito."); }
    finally { setBusy(false); }
  }

  async function runAction(action: "create" | "rotate_secret") {
    setBusy(true); setError(""); setMessage("");
    try {
      if (action === "create") {
        const token = await getToken();
        const crm = await fetch("/api/marketing/crm", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        if (!crm.ok) throw new Error("Non riesco a preparare la pipeline CRM. Riprova tra poco.");
      }
      const payload = await call("POST", action === "create" ? { action } : {
        action, expectedRotatedAt: data?.connection?.secretRotatedAt,
      });
      setData(payload); setOneTimeSecret(payload.oneTimeSecret ?? ""); setConfirmRotation(false);
      setMessage(action === "create" ? "Collegamento creato. Importazione in pausa." : `Nuovo segreto generato. Aggiornalo nel webhook di ${leadHostProBrand.name}.`);
    } catch (error) { setError(error instanceof Error ? error.message : "Operazione non riuscita."); }
    finally { setBusy(false); }
  }

  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setCopied(label); setMessage(`${label} copiato.`); }
    catch { setError("Copia non disponibile: seleziona e copia il contenuto del campo."); }
  }

  if (loading) return <div className="flex items-center gap-3 py-8 text-muted" role="status"><Loader2 size={20} className="animate-spin" />Caricamento integrazioni...</div>;

  const connection = data?.connection;
  const verified = Boolean(connection?.enabled && connection.secretRotatedAt && data?.events.some((event) =>
    ["imported", "updated"].includes(event.status) && new Date(event.receivedAt) >= new Date(connection.secretRotatedAt!),
  ));
  const status = !connection?.hasSecret ? "Non configurata" : !connection.enabled ? "In pausa" : verified ? "Collegamento verificato" : "In attesa del primo invio";

  return <div className="min-w-0 space-y-6">
    {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{error}</p> : null}
    {message ? <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">{message}</p> : null}
    {!data ? <button type="button" onClick={() => void load()} className="btn btn-secondary"><RefreshCw size={17} />Riprova</button> : <>
      <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-5 sm:p-6">
          <div className="flex min-w-0 items-center gap-3">
            <PlugZap size={28} className="shrink-0 text-green" aria-hidden="true" />
            <div className="min-w-0"><h2 className="text-xl font-semibold text-ink">{leadHostProBrand.name}</h2><p className="mt-1 text-sm text-muted">{leadHostProBrand.domain}</p><p className="mt-1 text-sm text-muted">Importazione contatti nel CRM</p></div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href={leadHostProBrand.guidePath} target="_blank" rel="noopener noreferrer" className="btn btn-secondary min-h-11" aria-label="Guida LeadHostPro (si apre in una nuova scheda)"><BookOpen size={17} />Guida<ExternalLink size={14} aria-hidden="true" /></Link>
            <span className={`max-w-full rounded px-3 py-1.5 text-sm font-semibold ${verified ? "bg-emerald-50 text-emerald-800" : connection?.enabled ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{status}</span>
          </div>
        </header>
        {!data.serverReady ? <div className="border-b border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 sm:px-6">Il collegamento non è ancora disponibile. Contatta l&apos;assistenza Lead Host.</div> : null}
        {!connection?.hasSecret ? <div className="space-y-4 p-5 sm:p-6">
          <button type="button" disabled={busy || !data.serverReady} onClick={() => void runAction("create")} className="btn btn-primary w-full sm:w-auto"><Plus size={18} />Crea collegamento</button>
        </div> : <details open={Boolean(oneTimeSecret)}>
          <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-green sm:px-6">Configurazione webhook</summary>
          <div className="grid min-w-0 gap-5 border-b border-slate-200 p-5 sm:p-6 lg:grid-cols-2">
            <CopyField label="URL webhook" value={connection.webhookUrl} copied={copied === "URL webhook"} onCopy={() => void copy(connection.webhookUrl, "URL webhook")} />
            {oneTimeSecret ? <CopyField label="Segreto" value={oneTimeSecret} copied={copied === "Segreto"} onCopy={() => void copy(oneTimeSecret, "Segreto")} /> : <div className="min-w-0"><p className="text-sm font-semibold text-ink">Segreto</p><p className="mt-3 text-sm text-muted">Già generato. Per sostituirlo, genera un nuovo segreto.</p></div>}
            {oneTimeSecret ? <p className="text-sm font-semibold text-amber-800 lg:col-span-2">Il segreto viene mostrato solo ora. Copialo nel campo “Segreto” di {leadHostProBrand.name} prima di lasciare la pagina.</p> : null}
          </div>
          <div className="p-5 sm:px-6">
            <button type="button" disabled={busy || flowBusy || !data.serverReady} onClick={() => setConfirmRotation((value) => !value)} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted"><KeyRound size={17} />Rigenera segreto</button>
            {confirmRotation ? <div className="mt-3 space-y-3 border-t border-amber-200 pt-4"><p className="text-sm text-amber-900">Il segreto attuale smetterà di funzionare. Dovrai sostituirlo nel webhook di {leadHostProBrand.name} per continuare a ricevere contatti.</p><div className="flex flex-wrap gap-3"><button type="button" className="btn btn-secondary" disabled={busy || flowBusy} onClick={() => setConfirmRotation(false)}>Annulla</button><button type="button" className="btn btn-primary" disabled={busy || flowBusy} onClick={() => void runAction("rotate_secret")}>Genera nuovo segreto</button></div></div> : null}
          </div>
        </details>}
      </section>
      {connection?.hasSecret ? <SystemeFlowsConsole key={connection.id} getToken={getToken} stages={data.stages} serverReady={data.serverReady}
        disabled={busy} onUpdated={load} onBusyChange={setFlowBusy} /> : null}
      <details className="border-y border-slate-200 py-4" open={!connection?.hasSecret}>
        <summary className="cursor-pointer font-semibold text-ink">Collega il tuo account {leadHostProBrand.name}</summary>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-6 text-muted">
          <li>In {leadHostProBrand.name} ({leadHostProBrand.domain}) apri Impostazioni → Webhook → Crea. Inserisci il nome “Lead Host CRM”, l&apos;URL webhook e il segreto mostrati qui.</li>
          <li>Lascia il webhook attivo, seleziona soltanto <strong className="text-ink">Opt-In</strong> e salva.</li>
          <li>Configura un flusso con le pagine, la fase CRM e i campi da importare. Avvia l&apos;importazione, compila il form di una tua landing e premi “Controlla ricezione”.</li>
        </ol>
        <p className="mt-3 text-sm text-muted">Il form deve raccogliere almeno nome ed email. Le fasi delle due pipeline restano indipendenti.</p>
        <Link href={leadHostProBrand.guidePath} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-green">Guida {leadHostProBrand.name}<ExternalLink size={15} /></Link>
      </details>
      <section className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-ink">Ultimi invii</h2><p className="mt-1 text-sm text-muted">Ultimi 25 eventi ricevuti da {leadHostProBrand.name}</p></div><button type="button" className="btn btn-secondary w-full sm:w-auto" disabled={busy || flowBusy} onClick={() => void refresh()}><RefreshCw size={17} />Controlla ricezione</button></div>
        {data.events.length ? <div className="divide-y divide-slate-200 border-y border-slate-200">{data.events.map((event) => <div key={event.id} className="grid min-w-0 gap-2 py-4 md:grid-cols-[160px_minmax(0,1fr)_120px] md:gap-4">
          <time dateTime={event.receivedAt} className="text-sm text-muted">{new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(new Date(event.receivedAt))}</time>
          <div className="min-w-0"><p className="break-words text-sm font-semibold text-ink">{event.contactName ?? (event.sourcePageUrl ? "Opt-In" : "Evento ricevuto")}</p>{event.sourcePageUrl ? <p className="mt-1 break-all text-sm text-muted">{event.sourcePageUrl}</p> : null}{event.reason ? <p className="mt-1 text-sm text-muted">{systemeReasonLabels[event.reason] ?? "Evento non importato"}</p> : null}</div>
          <span className={`h-fit w-fit rounded px-2 py-1 text-xs font-semibold ${["imported", "updated"].includes(event.status) ? "bg-emerald-50 text-emerald-800" : event.status === "failed" ? "bg-red-50 text-red-800" : "bg-slate-100 text-slate-600"}`}>{({ received: "Ricevuto", imported: "Importato", updated: "Collegato al CRM", ignored: "Escluso", failed: "Da verificare" })[event.status]}</span>
        </div>)}</div> : <p className="border-y border-slate-200 py-8 text-sm text-muted">Nessun invio ricevuto.</p>}
        <Link href="/app/marketing/crm" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-green"><CheckCircle2 size={17} />Apri CRM</Link>
      </section>
    </>}
  </div>;
}

function CopyField({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return <div className="min-w-0"><p className="mb-2 text-sm font-semibold text-ink">{label}</p><div className="flex min-w-0 gap-2"><input aria-label={label} className="form-input min-w-0 flex-1 font-mono text-xs" readOnly value={value} onFocus={(event) => event.target.select()} /><button type="button" onClick={onCopy} title={`Copia ${label}`} aria-label={`Copia ${label}`} className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-green">{copied ? <Check size={18} /> : <Copy size={18} />}</button></div></div>;
}
