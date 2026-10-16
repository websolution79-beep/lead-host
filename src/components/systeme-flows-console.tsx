"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, GitBranch, Loader2, Pause, Pencil, Play, Plus, Radar, RefreshCw, Trash2 } from "lucide-react";
import { SystemeFlowEditor } from "@/components/systeme-flow-editor";
import { SystemeIntegrationDialog } from "@/components/systeme-integration-dialog";
import { duplicateSystemeFlow, initialSystemeFlowBindings, knownFieldsForFlow, validateSystemeEditorFlow } from "@/lib/marketing/systeme/editor";
import { systemeFlowCommandSchema, systemeFlowSchema, systemeFlowSnapshotSchema, systemeFlowsStateSchema,
  type SystemeFlow, type SystemeFlowCommand, type SystemeFlowsState } from "@/lib/marketing/systeme/flows";

type Editor = { flow: SystemeFlow; initial: string; token: string };
type Confirmation = { kind: "delete"; flow: SystemeFlow } | { kind: "activate" } | { kind: "migrate"; flow: SystemeFlow; token: string } | { kind: "discard"; reload: boolean };

export function SystemeFlowsConsole({ getToken, stages, serverReady, disabled, onUpdated, onBusyChange }: {
  getToken: () => Promise<string>; stages: { id: string; name: string }[]; serverReady: boolean; disabled: boolean;
  onUpdated: () => Promise<void>; onBusyChange: (busy: boolean) => void;
}) {
  const [data, setData] = useState<SystemeFlowsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [now, setNow] = useState(0);
  const requestLock = useRef(false);
  const call = useCallback(async (body?: unknown) => {
    const response = await fetch("/api/marketing/integrations/systeme/flows", { method: body ? "PATCH" : "GET", cache: "no-store",
      headers: { Authorization: `Bearer ${await getToken()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json();
    if (!response.ok) throw Object.assign(new Error(typeof payload.error === "string" ? payload.error : "Flussi non disponibili."), { status: response.status });
    return payload;
  }, [getToken]);
  const load = useCallback(async () => {
    try { setData(systemeFlowsStateSchema.parse(await call())); }
    catch (error) { setError(error instanceof Error ? error.message : "Flussi non disponibili."); }
    finally { setLoading(false); }
  }, [call]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    const initial = window.setTimeout(() => setNow(Date.now()), 0);
    return () => { window.clearInterval(timer); window.clearTimeout(initial); };
  }, []);
  useEffect(() => {
    if (!editor || JSON.stringify(editor.flow) === editor.initial) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [editor]);

  async function execute(command: SystemeFlowCommand, token = data?.snapshot.configurationToken) {
    if (!token || requestLock.current || disabled) return false;
    const parsed = systemeFlowCommandSchema.safeParse({ version: 2, configurationToken: token, command });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Controlla il flusso."); return false; }
    requestLock.current = true; setBusy(true); onBusyChange(true); setError(""); setMessage("");
    try {
      const payload = await call(parsed.data);
      const snapshot = systemeFlowSnapshotSchema.parse(payload.snapshot);
      setData((current) => ({ snapshot, knownFields: current?.knownFields ?? [] }));
      setConfirmation(null); setConflict(false);
      if (command.action === "save_flow") setEditor(null);
      setMessage(({ save_flow: "Flusso salvato.", delete_flow: "Flusso eliminato. Le risposte gia importate restano nel CRM.",
        set_enabled: command.action === "set_enabled" && command.enabled ? "Importazione attivata." : "Importazione in pausa.",
        start_discovery: "Rilevamento campi avviato per 15 minuti.", stop_discovery: "Rilevamento campi interrotto." })[command.action]);
      await onUpdated();
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Salvataggio non riuscito.");
      if (error && typeof error === "object" && "status" in error && error.status === 409) setConflict(true);
      return false;
    } finally { requestLock.current = false; setBusy(false); onBusyChange(false); }
  }

  function openEditor(flow: SystemeFlow) {
    if (!data) return;
    const draft = structuredClone(flow);
    if (!draft.bindings.length) draft.bindings = initialSystemeFlowBindings(knownFieldsForFlow(draft, data.knownFields, data.snapshot.flows));
    setEditor({ flow: draft, initial: JSON.stringify(draft), token: data.snapshot.configurationToken });
    setError(""); setConflict(false); setMessage("");
  }
  function closeEditor(reload = false) {
    if (busy) return;
    if (editor && JSON.stringify(editor.flow) !== editor.initial) { setConfirmation({ kind: "discard", reload }); return; }
    setEditor(null); setError(""); setConflict(false);
    if (reload) void load();
  }
  function saveEditor() {
    if (!editor || !data) return;
    const parsed = systemeFlowSchema.safeParse(editor.flow);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Controlla il flusso."); return; }
    const valid = validateSystemeEditorFlow(parsed.data, data.snapshot);
    if (!valid.success) { setError(valid.error.issues[0]?.message ?? "Controlla nome e pagine del flusso."); return; }
    if (data.snapshot.routingMode === "legacy") setConfirmation({ kind: "migrate", flow: parsed.data, token: editor.token });
    else void execute({ action: "save_flow", flow: parsed.data }, editor.token);
  }

  if (loading) return <div role="status" className="flex items-center gap-2 py-6 text-sm text-muted"><Loader2 size={18} className="animate-spin" />Caricamento flussi...</div>;
  if (!data) return <section className="space-y-3 border-y border-slate-200 py-5"><p role="alert" className="text-sm text-red-700">{error}</p><button type="button" className="btn btn-secondary" onClick={() => { setError(""); void load(); }}><RefreshCw size={16} />Riprova</button></section>;
  const snapshot = data.snapshot;
  const locked = busy || disabled;
  const discoveryActive = Boolean(now && snapshot.discoveryExpiresAt && new Date(snapshot.discoveryExpiresAt).getTime() > now);
  const canActivate = serverReady && stages.length > 0 && snapshot.routingMode === "flows" && snapshot.flows.some((flow) => flow.enabled)
    && snapshot.flows.every((flow) => !flow.enabled || systemeFlowSchema.safeParse(flow).success);
  return <section className="min-w-0 space-y-5" aria-labelledby="systeme-flows-heading">
    {!editor && !confirmation && error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
    {message ? <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{message}</p> : null}
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
      <div><h2 id="systeme-flows-heading" className="flex items-center gap-2 text-lg font-semibold text-ink"><GitBranch size={20} className="text-green" />Flussi di importazione</h2>
        <p className="mt-1 text-sm text-muted">{snapshot.flows.length}/20 flussi{snapshot.routingMode === "legacy" ? " - configurazione precedente" : ""}</p></div>
      <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-ink"><input type="checkbox" role="switch" aria-label="Importazione attiva" className="size-5 accent-emerald-700"
          checked={snapshot.enabled} disabled={locked || snapshot.routingMode === "legacy" || (!snapshot.enabled && !canActivate)} onChange={(event) => event.target.checked ? setConfirmation({ kind: "activate" }) : void execute({ action: "set_enabled", enabled: false })} />
          {snapshot.enabled ? "Importazione attiva" : "Importazione in pausa"}</label>
        <button type="button" className="btn btn-primary w-full sm:w-auto" disabled={locked || snapshot.flows.length >= 20} onClick={() => openEditor({
          id: crypto.randomUUID(), name: "", enabled: false, importMode: "selected_pages", allowedPageUrls: [""], destinationStageId: null, bindings: [],
        })}><Plus size={17} />Nuovo flusso</button>
      </div>
    </header>
    <div className="divide-y divide-slate-200 border-b border-slate-200">
      {snapshot.flows.map((flow) => <article key={flow.id} className="grid min-w-0 gap-4 py-5 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0 space-y-2"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-semibold text-ink [overflow-wrap:anywhere]">{flow.name}</h3>
          <span className={`rounded px-2 py-1 text-xs font-semibold ${flow.enabled && snapshot.enabled ? "bg-emerald-50 text-emerald-800" : flow.enabled ? "bg-blue-50 text-blue-800" : "bg-slate-100 text-muted"}`}>{flow.enabled ? snapshot.enabled ? "Attivo" : "Pronto" : "In pausa"}</span></div>
          <p className="flex items-start gap-2 text-sm text-muted"><GitBranch size={16} className="mt-0.5 shrink-0 text-green" /><span className="break-words">{stages.find((stage) => stage.id === flow.destinationStageId)?.name ?? "Prima fase della pipeline"} <span className="text-slate-400">|</span> {flow.bindings.filter((binding) => binding.targetField !== "ignore").length} campi associati</span></p>
          {flow.importMode === "all" ? <p className="text-sm text-muted">Tutte le pagine non assegnate ad altri flussi</p> : <ul className="space-y-1 text-sm text-muted">{flow.allowedPageUrls.map((url) => <li key={url} className="break-all">{url}</li>)}</ul>}
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <IconButton label={`Modifica ${flow.name}`} disabled={locked} onClick={() => openEditor(flow)}><Pencil size={17} /></IconButton>
          <IconButton label={`Duplica ${flow.name}`} disabled={locked || snapshot.flows.length >= 20} onClick={() => openEditor(duplicateSystemeFlow(flow, crypto.randomUUID(), snapshot.flows))}><Copy size={17} /></IconButton>
          <IconButton label={`${flow.enabled ? "Metti in pausa" : "Abilita"} ${flow.name}`} disabled={locked || snapshot.routingMode === "legacy"} onClick={() => {
            const toggled = { ...flow, enabled: !flow.enabled };
            const parsed = systemeFlowSchema.safeParse(toggled);
            if (!parsed.success) { openEditor(toggled); setError(parsed.error.issues[0]?.message ?? "Completa i campi richiesti."); }
            else void execute({ action: "save_flow", flow: parsed.data });
          }}>{flow.enabled ? <Pause size={17} /> : <Play size={17} />}</IconButton>
          <IconButton label={`Elimina ${flow.name}`} disabled={locked || snapshot.routingMode === "legacy"} onClick={() => { setError(""); setConfirmation({ kind: "delete", flow }); }}><Trash2 size={17} /></IconButton>
        </div>
      </article>)}
      {!snapshot.flows.length ? <p className="py-7 text-sm text-muted">Nessun flusso configurato.</p> : null}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-5">
      <div className="min-w-0"><h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><Radar size={18} className="text-green" />Rilevamento campi</h3>
        <p className="mt-1 text-sm text-muted">{discoveryActive ? `Attivo fino alle ${new Date(snapshot.discoveryExpiresAt!).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : "Non attivo"} <span className="text-slate-400">|</span> {data.knownFields.length} campi rilevati</p></div>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
        <button type="button" className="btn btn-secondary flex-1 sm:flex-none" disabled={locked} onClick={() => { setError(""); void load(); }}><RefreshCw size={16} />Aggiorna campi</button>
        <button type="button" className="btn btn-secondary flex-1 sm:flex-none" disabled={locked || !serverReady || snapshot.routingMode !== "flows"}
          title={snapshot.routingMode === "legacy" ? "Salva prima la configurazione di un flusso" : undefined}
          onClick={() => void execute(discoveryActive ? { action: "stop_discovery" } : { action: "start_discovery", minutes: 15 })}><Radar size={16} />{discoveryActive ? "Interrompi" : "Rileva per 15 minuti"}</button>
      </div>
    </div>
    {editor ? <SystemeFlowEditor draft={editor.flow} flows={snapshot.flows} stages={stages} knownFields={data.knownFields} busy={locked} error={error} conflict={conflict}
      onChange={(flow) => setEditor((current) => current ? { ...current, flow } : null)} onClose={() => closeEditor()} onSave={saveEditor} onRefresh={() => { setError(""); void load(); }} onReload={() => closeEditor(true)} /> : null}
    {confirmation ? <SystemeIntegrationDialog title={confirmation.kind === "delete" ? "Elimina flusso" : confirmation.kind === "activate" ? "Attiva importazione" : confirmation.kind === "migrate" ? "Configura flussi indipendenti" : "Modifiche non salvate"}
      busy={busy} onClose={() => { setConfirmation(null); setError(""); }}>
      <div className="space-y-4 py-5 text-sm leading-6 text-muted">
        <p>{confirmation.kind === "delete" ? `Eliminare il flusso "${confirmation.flow.name}"? Le pagine non saranno piu riservate a questo flusso. Contatti e risposte gia importati resteranno nel CRM.`
          : confirmation.kind === "activate" ? `Avviare l'importazione dei ${snapshot.flows.filter((flow) => flow.enabled).length} flussi abilitati?`
          : confirmation.kind === "migrate" ? "Il collegamento passera ai flussi indipendenti e rimarra in pausa. L'importazione potra essere avviata separatamente dopo aver completato la configurazione."
          : "Le modifiche del flusso non sono state salvate. Vuoi scartarle?"}</p>
        {error && confirmation.kind !== "discard" ? <p role="alert" className="text-red-700">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2"><button type="button" className="btn btn-secondary flex-1 sm:flex-none" disabled={busy} onClick={() => { setConfirmation(null); setError(""); }}>Annulla</button>
          <button type="button" className={`btn flex-1 sm:flex-none ${confirmation.kind === "delete" ? "border border-red-200 bg-red-50 text-red-700" : "btn-primary"}`} disabled={busy} onClick={() => {
            if (confirmation.kind === "delete") void execute({ action: "delete_flow", flowId: confirmation.flow.id });
            else if (confirmation.kind === "activate") void execute({ action: "set_enabled", enabled: true });
            else if (confirmation.kind === "migrate") void execute({ action: "save_flow", flow: confirmation.flow }, confirmation.token);
            else { const reload = confirmation.reload; setConfirmation(null); setEditor(null); setConflict(false); setError(""); if (reload) void load(); }
          }}>{busy ? <Loader2 size={16} className="animate-spin" /> : null}{confirmation.kind === "delete" ? "Elimina flusso" : confirmation.kind === "activate" ? "Attiva importazione" : confirmation.kind === "migrate" ? "Salva e mantieni in pausa" : "Scarta modifiche"}</button></div>
      </div>
    </SystemeIntegrationDialog> : null}
  </section>;
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
    className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-muted hover:border-emerald-600 hover:text-green disabled:opacity-40">{children}</button>;
}
