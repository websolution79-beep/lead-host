"use client";

import { useId } from "react";
import { ArrowRight, Loader2, Plus, RefreshCw, Save, Sparkles, Trash2 } from "lucide-react";
import { SystemeIntegrationDialog } from "@/components/systeme-integration-dialog";
import { addDiscoveredBindings, knownFieldsForFlow, systemeTargetLabels } from "@/lib/marketing/systeme/editor";
import { systemeFieldTargets, type SystemeFieldBinding, type SystemeFlow, type SystemeKnownField } from "@/lib/marketing/systeme/flows";
import { leadHostProBrand } from "@/lib/marketing/leadhostpro";

export function SystemeFlowEditor({ draft, flows, stages, knownFields, busy, error, conflict, onChange, onClose, onSave, onRefresh, onReload }: {
  draft: SystemeFlow; flows: SystemeFlow[]; stages: { id: string; name: string }[]; knownFields: SystemeKnownField[];
  busy: boolean; error: string; conflict: boolean; onChange: (draft: SystemeFlow) => void; onClose: () => void;
  onSave: () => void; onRefresh: () => void; onReload: () => void;
}) {
  const sourcesId = useId();
  const fields = knownFieldsForFlow(draft, knownFields, flows);
  const detectedPages = [...new Set(knownFields.map((field) => field.sourcePageUrl).filter(Boolean))];
  const reservedPages = new Map(flows.filter((flow) => flow.id !== draft.id).flatMap((flow) => flow.allowedPageUrls.map((url) => [url, flow.name] as const)));
  function bindingChange(index: number, update: Partial<SystemeFieldBinding>) {
    const bindings = draft.bindings.map((binding, at) => at === index ? { ...binding, ...update } : binding);
    onChange({ ...draft, bindings });
  }
  const controlDisabled = busy || conflict;
  return <SystemeIntegrationDialog title="Configurazione flusso" onClose={onClose} busy={busy} wide>
    <form onSubmit={(event) => { event.preventDefault(); onSave(); }} className="min-w-0">
      <div className="space-y-6 py-5">
        {error ? <div role="alert" className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p>{error}</p>{conflict ? <button type="button" onClick={onReload} className="inline-flex min-h-11 items-center gap-2 font-semibold"><RefreshCw size={16} />Ricarica configurazione</button> : null}
        </div> : null}
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <label className="grid min-w-0 gap-2 text-sm font-semibold">Nome del flusso
            <input className="form-input" autoComplete="off" required maxLength={100} value={draft.name} disabled={controlDisabled}
              placeholder="Es. Proprietari Milano" onChange={(event) => onChange({ ...draft, name: event.target.value })} />
          </label>
          <label className="grid min-w-0 gap-2 text-sm font-semibold">Fase di destinazione
            <select className="filter-select" value={draft.destinationStageId ?? ""} disabled={controlDisabled}
              onChange={(event) => onChange({ ...draft, destinationStageId: event.target.value || null })}>
              <option value="">Prima fase della pipeline</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
            </select>
          </label>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input type="checkbox" className="size-5 shrink-0 accent-emerald-700" checked={draft.enabled} disabled={controlDisabled}
            onChange={(event) => onChange({ ...draft, enabled: event.target.checked })} />Flusso abilitato
        </label>
        <fieldset className="min-w-0 border-t border-slate-200 pt-4">
          <legend className="px-1 text-sm font-semibold">Pagine di provenienza</legend>
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
            {([ ["selected_pages", "Pagine selezionate"], ["all", "Tutte le altre pagine"] ] as const).map(([mode, label]) =>
              <label key={mode} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm font-semibold ${draft.importMode === mode ? "border-emerald-600 bg-emerald-50 text-green" : "border-slate-200 text-muted"}`}>
                <input type="radio" name="flowPages" value={mode} className="size-4 shrink-0 accent-emerald-700" checked={draft.importMode === mode} disabled={controlDisabled}
                  onChange={() => onChange({ ...draft, importMode: mode, allowedPageUrls: mode === "all" ? [] : draft.allowedPageUrls.length ? draft.allowedPageUrls : [""] })} />{label}
              </label>)}
          </div>
          {draft.importMode === "selected_pages" ? <div className="mt-4 min-w-0 space-y-3">
            {detectedPages.length ? <label className="grid min-w-0 gap-2 text-sm font-semibold">Pagine rilevate
              <select className="filter-select" value="" disabled={controlDisabled || draft.allowedPageUrls.length >= 50} onChange={(event) => {
                if (event.target.value) onChange({ ...draft, allowedPageUrls: [...draft.allowedPageUrls.filter(Boolean), event.target.value] });
              }}><option value="">Seleziona una pagina</option>{detectedPages.map((url) => <option key={url} value={url} disabled={reservedPages.has(url) || draft.allowedPageUrls.includes(url)}>
                {url}{reservedPages.has(url) ? ` (${reservedPages.get(url)})` : ""}
              </option>)}</select>
            </label> : null}
            {(draft.allowedPageUrls.length ? draft.allowedPageUrls : [""]).map((url, index) => <div key={index} className="flex min-w-0 items-center gap-2">
              <label className="grid min-w-0 flex-1 gap-1 text-xs font-semibold text-muted">URL pagina {index + 1}
                <input type="url" className="form-input" required value={url} disabled={controlDisabled} placeholder="https://tuosito.it/proprietari" onChange={(event) => {
                  const pages = [...draft.allowedPageUrls]; pages[index] = event.target.value; onChange({ ...draft, allowedPageUrls: pages });
                }} />
              </label>
              <button type="button" aria-label={`Rimuovi pagina ${index + 1}`} title="Rimuovi pagina" disabled={controlDisabled} onClick={() => onChange({ ...draft, allowedPageUrls: draft.allowedPageUrls.filter((_, at) => at !== index) })}
                className="mt-5 flex size-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-muted hover:text-red-700"><Trash2 size={17} /></button>
            </div>)}
            <button type="button" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-green" disabled={controlDisabled || draft.allowedPageUrls.length >= 50}
              onClick={() => onChange({ ...draft, allowedPageUrls: [...(draft.allowedPageUrls.length ? draft.allowedPageUrls : [""]), ""] })}><Plus size={17} />Aggiungi pagina</button>
          </div> : null}
        </fieldset>
        <section className="min-w-0 border-t border-slate-200 pt-5" aria-labelledby={`${sourcesId}-heading`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 id={`${sourcesId}-heading`} className="font-semibold">Associazioni campi <span className="text-sm font-normal text-muted">({draft.bindings.length}/200)</span></h3>
            <button type="button" disabled={controlDisabled} onClick={onRefresh} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-green"><RefreshCw size={15} />Aggiorna campi</button>
          </div>
          <datalist id={sourcesId}>{fields.map((field) => <option key={field.sourceSlug} value={field.sourceSlug}>{field.fieldLabel ?? field.sourceSlug}</option>)}</datalist>
          <div className="divide-y divide-slate-200 border-y border-slate-200">
            {draft.bindings.map((binding, index) => <div key={index} className="grid min-w-0 grid-cols-[minmax(0,1fr)_44px] gap-x-2 gap-y-3 py-4 sm:grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)_44px]">
              <label className="grid min-w-0 gap-2 text-xs font-semibold text-muted">Campo {leadHostProBrand.name} {index + 1}
                <input className="form-input font-mono" list={sourcesId} autoComplete="off" required maxLength={160} disabled={controlDisabled} value={binding.sourceSlug} placeholder="nome_campo"
                  onChange={(event) => bindingChange(index, { sourceSlug: event.target.value })} />
                {fields.find((field) => field.sourceSlug === binding.sourceSlug)?.fieldLabel ? <span className="break-words font-normal">{fields.find((field) => field.sourceSlug === binding.sourceSlug)?.fieldLabel}</span> : null}
              </label>
              <ArrowRight size={17} aria-hidden="true" className="mt-9 hidden text-slate-400 sm:block" />
              <label className="col-start-1 grid min-w-0 gap-2 text-xs font-semibold text-muted sm:col-start-3 sm:row-start-auto">Campo CRM {index + 1}
                <select className="filter-select" disabled={controlDisabled} value={binding.targetField} onChange={(event) => bindingChange(index, {
                  targetField: event.target.value as SystemeFieldBinding["targetField"], additionalLabel: event.target.value === "additional" ? binding.additionalLabel ?? "" : null,
                })}>{systemeFieldTargets.map((target) => <option key={target} value={target} disabled={!["additional", "ignore"].includes(target)
                  && draft.bindings.some((item, at) => at !== index && item.targetField === target)}>{systemeTargetLabels[target]}</option>)}</select>
              </label>
              <button type="button" aria-label={`Rimuovi associazione ${index + 1}`} title="Rimuovi associazione" disabled={controlDisabled}
                onClick={() => onChange({ ...draft, bindings: draft.bindings.filter((_, at) => at !== index) })}
                className="col-start-2 row-start-1 mt-6 flex size-11 items-center justify-center rounded-lg border border-slate-200 text-muted hover:text-red-700 sm:col-start-4"><Trash2 size={17} /></button>
              {binding.targetField === "additional" ? <label className="col-span-full grid min-w-0 gap-2 text-xs font-semibold text-muted">Etichetta risposta {index + 1}
                <input className="form-input" required maxLength={120} value={binding.additionalLabel ?? ""} disabled={controlDisabled} placeholder="Es. Zona preferita"
                  onChange={(event) => bindingChange(index, { additionalLabel: event.target.value })} />
              </label> : null}
            </div>)}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            <button type="button" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-green" disabled={controlDisabled || draft.bindings.length >= 200}
              onClick={() => onChange({ ...draft, bindings: [...draft.bindings, { sourceSlug: "", targetField: "ignore", additionalLabel: null }] })}><Plus size={17} />Aggiungi associazione</button>
            <button type="button" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-green" disabled={controlDisabled || !fields.length || draft.bindings.length >= 200}
              onClick={() => onChange({ ...draft, bindings: addDiscoveredBindings(draft.bindings, fields) })}><Sparkles size={17} />Aggiungi campi rilevati</button>
          </div>
        </section>
      </div>
      <footer className="sticky bottom-0 z-10 flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white py-4">
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>Annulla</button>
        <button type="submit" className="btn btn-primary flex-1 whitespace-nowrap sm:flex-none" disabled={controlDisabled}>{busy ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}Salva flusso</button>
      </footer>
    </form>
  </SystemeIntegrationDialog>;
}
