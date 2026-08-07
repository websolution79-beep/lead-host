"use client";

import { useCallback, useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Columns3, GripVertical, Home, Pencil, Phone, Plus, Trash2, UserRound, X } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import type { AdminLeadRecord } from "@/lib/admin/lead-records";

type PipelineStage = { id: string; name: string; color: string; position: number };
type PipelineResponse = { stages?: PipelineStage[]; error?: string };
type StageDraft = { id?: string; name: string; color: string };

const stageColors = ["#2563EB", "#7C3AED", "#0F766E", "#B45309", "#C2410C", "#047857", "#4F46E5", "#B91C1C"] as const;

export function AdminNewLeadsPipeline({ records, canManage, onOpenDetail, onChanged }: {
  records: AdminLeadRecord[];
  canManage: boolean;
  onOpenDetail: (record: AdminLeadRecord) => void;
  onChanged: () => Promise<void>;
}) {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [stageEditor, setStageEditor] = useState<StageDraft | null>(null);
  const [stageToDelete, setStageToDelete] = useState<PipelineStage | null>(null);
  const [deleteDestinationId, setDeleteDestinationId] = useState("");

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadStages = useCallback(async () => {
    const token = await getToken();
    if (!token) { setError("Sessione non disponibile. Effettua nuovamente l'accesso."); setLoading(false); return; }
    const response = await fetch("/api/admin/leads/pipeline", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const payload = (await response.json()) as PipelineResponse;
    if (!response.ok) setError(payload.error ?? "Non riesco a caricare la pipeline.");
    else setStages(payload.stages ?? []);
    setLoading(false);
  }, [getToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadStages(), 0);
    return () => window.clearTimeout(timer);
  }, [loadStages]);

  async function updatePipeline(body: Record<string, unknown>) {
    const token = await getToken();
    if (!token) { setError("Sessione non disponibile. Effettua nuovamente l'accesso."); return false; }
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/leads/pipeline", {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const payload = (await response.json()) as PipelineResponse;
      if (!response.ok) { setError(payload.error ?? "Aggiornamento pipeline non riuscito."); return false; }
      setStages(payload.stages ?? []);
      await onChanged();
      return true;
    } finally { setSaving(false); }
  }

  async function saveStage() {
    if (!stageEditor) return;
    const saved = await updatePipeline(stageEditor.id
      ? { action: "update_stage", stageId: stageEditor.id, name: stageEditor.name, color: stageEditor.color }
      : { action: "create_stage", name: stageEditor.name, color: stageEditor.color });
    if (saved) setStageEditor(null);
  }
  async function moveStage(stageId: string, direction: "left" | "right") { await updatePipeline({ action: "move_stage", stageId, direction }); }
  async function deleteStage() {
    if (!stageToDelete || !deleteDestinationId) return;
    const deleted = await updatePipeline({ action: "delete_stage", stageId: stageToDelete.id, moveRequestsToStageId: deleteDestinationId });
    if (deleted) { setStageToDelete(null); setDeleteDestinationId(""); }
  }
  async function moveLead(ownerRequestId: string, stageId: string) {
    const changed = await updatePipeline({ action: "move_request", ownerRequestId, stageId });
    if (changed) setDraggingId(null);
  }

  if (loading) return <section className="card p-8 text-center text-muted">Caricamento pipeline nuovi lead...</section>;

  return (
    <section className="grid min-w-0 max-w-full gap-4">
      <div className="card p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-green"><Columns3 size={18} /><p className="section-kicker">Lavorazione richieste</p></div>
            <h2 className="mt-2 text-2xl font-semibold text-ink">Pipeline Nuovi Lead</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Organizza le richieste prima della verifica. Spostare una scheda cambia solo la fase operativa, non lo stato del lead.</p>
          </div>
          {canManage ? <button className="btn btn-secondary w-full sm:w-auto" type="button" disabled={saving} onClick={() => setStageEditor({ name: "", color: "#047857" })}><Plus size={17} />Aggiungi colonna</button> : null}
        </div>
      </div>
      {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p> : null}
      <div className="min-w-0 max-w-full overflow-x-auto pb-3">
        <div className="grid min-w-max grid-flow-col auto-cols-[minmax(286px,336px)] gap-4">
          {stages.map((stage, index) => {
            const stageRecords = records.filter((record) => record.reviewPipelineStageId === stage.id);
            return <article className={`flex min-h-[370px] flex-col rounded-xl border border-slate-200 bg-slate-100/80 p-3 transition ${draggingId ? "border-dashed" : ""}`} key={stage.id}
              onDragOver={(event) => canManage && event.preventDefault()} onDrop={(event) => { if (!canManage) return; event.preventDefault(); const id = event.dataTransfer.getData("text/leadhost-owner-request") || draggingId; if (id) void moveLead(id, stage.id); }}>
              <div className="flex items-start justify-between gap-2 px-1 pb-3">
                <div className="min-w-0"><span className="flex items-center gap-2 text-sm font-bold text-ink"><span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} /><span className="truncate">{stage.name}</span></span><span className="mt-1 block text-xs font-semibold text-muted">{stageRecords.length} lead</span></div>
                {canManage ? <div className="flex shrink-0 items-center gap-1">
                  <IconButton label={`Sposta ${stage.name} a sinistra`} disabled={index === 0 || saving} onClick={() => void moveStage(stage.id, "left")}><ArrowLeft size={15} /></IconButton>
                  <IconButton label={`Sposta ${stage.name} a destra`} disabled={index === stages.length - 1 || saving} onClick={() => void moveStage(stage.id, "right")}><ArrowRight size={15} /></IconButton>
                  <IconButton label={`Modifica ${stage.name}`} disabled={saving} onClick={() => setStageEditor({ id: stage.id, name: stage.name, color: stage.color })}><Pencil size={15} /></IconButton>
                </div> : null}
              </div>
              <div className="grid min-h-24 gap-3">
                {stageRecords.map((record) => <NewLeadCard key={record.ownerRequestId} record={record} draggable={canManage} dragging={draggingId === record.ownerRequestId} onDragStart={(event) => { event.dataTransfer.setData("text/leadhost-owner-request", record.ownerRequestId); event.dataTransfer.effectAllowed = "move"; setDraggingId(record.ownerRequestId); }} onDragEnd={() => setDraggingId(null)} onOpen={() => onOpenDetail(record)} />)}
                {!stageRecords.length ? <div className="grid min-h-24 place-items-center rounded-lg border border-dashed border-slate-300 px-4 text-center text-sm text-slate-400">{canManage ? "Trascina qui un lead." : "Nessun lead in questa fase."}</div> : null}
              </div>
            </article>;
          })}
        </div>
      </div>
      {stageEditor ? <StageDialog draft={stageEditor} saving={saving} canDelete={Boolean(stageEditor.id) && stages.length > 1} onChange={(update) => setStageEditor((current) => current ? { ...current, ...update } : current)} onClose={() => setStageEditor(null)} onDelete={() => { const stage = stages.find((item) => item.id === stageEditor.id) ?? null; setStageEditor(null); setStageToDelete(stage); setDeleteDestinationId(stages.find((item) => item.id !== stage?.id)?.id ?? ""); }} onSave={() => void saveStage()} /> : null}
      {stageToDelete ? <DeleteStageDialog stage={stageToDelete} destinations={stages.filter((stage) => stage.id !== stageToDelete.id)} destinationId={deleteDestinationId} saving={saving} onChangeDestination={setDeleteDestinationId} onClose={() => setStageToDelete(null)} onConfirm={() => void deleteStage()} /> : null}
    </section>
  );
}

function NewLeadCard({ record, draggable, dragging, onDragStart, onDragEnd, onOpen }: { record: AdminLeadRecord; draggable: boolean; dragging: boolean; onDragStart: (event: DragEvent<HTMLElement>) => void; onDragEnd: () => void; onOpen: () => void }) {
  return <button className={`group w-full rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-green/40 hover:shadow-md ${dragging ? "opacity-40" : ""}`} draggable={draggable} type="button" onClick={onOpen} onDragEnd={onDragEnd} onDragStart={onDragStart}>
    <div className="flex items-start gap-2">
      {draggable ? <GripVertical className="mt-0.5 shrink-0 text-slate-300 group-hover:text-green" size={17} /> : null}
      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted"><Home size={12} />Immobile</p>
          <FirstWorkedBadge record={record} />
        </div>
        <div>
          <p className="mt-1 break-words text-sm font-bold leading-5 text-green">{record.lead?.title ?? defaultTitle(record)}</p>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted"><UserRound size={12} />Proprietario</p>
          <p className="mt-1 break-words text-sm font-semibold leading-5 text-slate-700">{formatOwnerName(record)}</p>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted"><Phone size={12} />Telefono</p>
          <p className="mt-1 break-all text-sm font-semibold leading-5 text-slate-700">{record.contact?.phone ?? "Non indicato"}</p>
        </div>
      </div>
    </div>
  </button>;
}
function FirstWorkedBadge({ record }: { record: AdminLeadRecord }) {
  const worker = record.firstWorkedBy;
  if (!worker) return null;
  const name = `${worker.firstName ?? ""} ${worker.lastName?.trim().slice(0, 1) ?? ""}`.trim();
  if (!name) return null;
  const color = worker.badgeColor ?? "#2563EB";
  return <span className="max-w-[120px] truncate rounded-full border px-2 py-0.5 text-[10px] font-bold" style={{ borderColor: color, color, backgroundColor: `${color}14` }}>{name}{worker.lastName ? "." : ""}</span>;
}
function formatOwnerName(record: AdminLeadRecord) { return `${record.contact?.firstName ?? ""} ${record.contact?.lastName ?? ""}`.trim() || "Non indicato"; }
function defaultTitle(record: AdminLeadRecord) { const type = record.property?.propertyType?.trim() || "Immobile"; const city = record.property?.city?.trim(); return city ? `${type} a ${city}` : type; }
function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) { return <button aria-label={label} className="grid size-8 place-items-center rounded-md text-slate-500 hover:bg-white hover:text-ink disabled:opacity-30" type="button" disabled={disabled} onClick={onClick}>{children}</button>; }

function StageDialog({ draft, saving, canDelete, onChange, onClose, onDelete, onSave }: { draft: StageDraft; saving: boolean; canDelete: boolean; onChange: (update: Partial<StageDraft>) => void; onClose: () => void; onDelete: () => void; onSave: () => void }) {
  return <Modal title={draft.id ? "Modifica colonna" : "Nuova colonna"} onClose={onClose}>
    <label className="grid gap-2 text-sm font-semibold text-ink">Nome colonna<input autoFocus className="form-input" maxLength={80} value={draft.name} onChange={(event) => onChange({ name: event.target.value })} /></label>
    <div className="mt-5"><p className="text-sm font-semibold text-ink">Colore identificativo</p><div className="mt-3 flex flex-wrap gap-2">{stageColors.map((color) => <button aria-label={`Usa il colore ${color}`} className={`size-9 rounded-full border-2 ${draft.color === color ? "border-ink" : "border-white"}`} key={color} type="button" style={{ backgroundColor: color }} onClick={() => onChange({ color })} />)}</div></div>
    <div className="mt-7 flex flex-wrap justify-between gap-3">{canDelete ? <button className="btn border-red-200 bg-red-50 text-red-700 hover:bg-red-100" type="button" onClick={onDelete}><Trash2 size={16} />Elimina</button> : <span />}<div className="flex gap-2"><button className="btn btn-secondary" type="button" onClick={onClose}>Annulla</button><button className="btn btn-primary" disabled={saving || draft.name.trim().length < 2} type="button" onClick={onSave}>Salva</button></div></div>
  </Modal>;
}
function DeleteStageDialog({ stage, destinations, destinationId, saving, onChangeDestination, onClose, onConfirm }: { stage: PipelineStage; destinations: PipelineStage[]; destinationId: string; saving: boolean; onChangeDestination: (value: string) => void; onClose: () => void; onConfirm: () => void }) {
  return <Modal title="Elimina colonna" onClose={onClose}><p className="text-sm leading-6 text-muted">I lead in <strong className="text-ink">{stage.name}</strong> verranno spostati nella colonna scelta prima dell&apos;eliminazione.</p><label className="mt-5 grid gap-2 text-sm font-semibold text-ink">Sposta lead in<select className="form-input" value={destinationId} onChange={(event) => onChangeDestination(event.target.value)}>{destinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.name}</option>)}</select></label><div className="mt-7 flex justify-end gap-2"><button className="btn btn-secondary" type="button" onClick={onClose}>Annulla</button><button className="btn border-red-200 bg-red-50 text-red-700 hover:bg-red-100" disabled={saving || !destinationId} type="button" onClick={onConfirm}>Elimina definitivamente</button></div></Modal>;
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="fixed inset-0 z-[80] grid place-items-end bg-slate-950/35 p-0 sm:place-items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}><div className="w-full max-w-lg rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-xl sm:p-6"><div className="flex items-center justify-between gap-4"><h2 className="text-xl font-semibold text-ink">{title}</h2><button aria-label="Chiudi" className="icon-button size-9" type="button" onClick={onClose}><X size={17} /></button></div><div className="mt-5">{children}</div></div></div>; }
