"use client";

import { useCallback, useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Columns3,
  Download,
  FileText,
  GripVertical,
  Home,
  LoaderCircle,
  MapPin,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { ITALY_GEO } from "@/lib/geo/italy-geo";
import {
  OWNER_CURRENT_STATUS_OPTIONS,
  OWNER_PROPERTY_TYPES,
  OWNER_REQUESTED_SERVICE_OPTIONS,
  OWNER_TIMING_OPTIONS,
} from "@/lib/owner-requests/options";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

type CrmStage = {
  id: string;
  pipeline_id: string;
  name: string;
  color: string;
  position: number;
};

type CrmContact = {
  id: string;
  stage_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  property_address: string | null;
  property_type: string | null;
  region: string | null;
  province: string | null;
  city: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  area_sqm: number | null;
  current_status: string | null;
  requested_services: string[];
  timing: string | null;
  property_description: string | null;
  notes: string | null;
  next_follow_up_at: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

type CrmPayload = {
  pipeline: { id: string; name: string };
  stages: CrmStage[];
  contacts: CrmContact[];
  error?: string;
};

type ContactDraft = {
  stageId: string;
  fullName: string;
  email: string;
  phone: string;
  propertyAddress: string;
  propertyType: string;
  region: string;
  province: string;
  city: string;
  bedrooms: string;
  bathrooms: string;
  areaSqm: string;
  currentStatus: string;
  requestedServices: string[];
  timing: string;
  propertyDescription: string;
  notes: string;
  nextFollowUpAt: string;
};

type CrmDocument = {
  id: string;
  original_name: string;
  content_type: string;
  byte_size: number;
  created_at: string;
  download_url: string;
};

type StageDraft = {
  id?: string;
  name: string;
  color: string;
};

const stageColors = [
  "#2563EB",
  "#7C3AED",
  "#0F766E",
  "#B45309",
  "#C2410C",
  "#047857",
  "#4F46E5",
  "#15803D",
  "#B91C1C",
] as const;

export function MarketingCrmBoard() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [data, setData] = useState<CrmPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [draggingContactId, setDraggingContactId] = useState<string | null>(null);
  const [contactEditor, setContactEditor] = useState<{
    contact: CrmContact | null;
    draft: ContactDraft;
  } | null>(null);
  const [stageEditor, setStageEditor] = useState<StageDraft | null>(null);
  const [stageToDelete, setStageToDelete] = useState<CrmStage | null>(null);
  const [deleteDestinationId, setDeleteDestinationId] = useState("");

  const getToken = useCallback(async () => {
    const { data: session } = await supabase.auth.getSession();
    return session.session?.access_token ?? null;
  }, [supabase]);

  const loadCrm = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setError("Sessione non disponibile. Effettua nuovamente l'accesso.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/marketing/crm", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json()) as CrmPayload;
    if (!response.ok) {
      setError(payload.error ?? "Non riesco a caricare il CRM.");
    } else {
      setData(payload);
    }
    setLoading(false);
  }, [getToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCrm(), 0);
    return () => window.clearTimeout(timer);
  }, [loadCrm]);

  async function updateCrm(body: Record<string, unknown>, successMessage: string) {
    const token = await getToken();
    if (!token) {
      setError("Sessione non disponibile. Effettua nuovamente l'accesso.");
      return false;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/marketing/crm", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as CrmPayload;
      if (!response.ok) {
        setError(payload.error ?? "Aggiornamento CRM non riuscito.");
        return false;
      }
      setData(payload);
      setSuccess(successMessage);
      return true;
    } finally {
      setSaving(false);
    }
  }

  function openNewContact(stageId: string) {
    setContactEditor({ contact: null, draft: emptyContactDraft(stageId) });
  }

  function openContact(contact: CrmContact) {
    setContactEditor({ contact, draft: contactToDraft(contact) });
  }

  async function saveContact() {
    if (!contactEditor) return;
    const draft = contactEditor.draft;
    const contact = {
      stageId: draft.stageId,
      fullName: draft.fullName,
      email: nullableValue(draft.email),
      phone: nullableValue(draft.phone),
      propertyAddress: nullableValue(draft.propertyAddress),
      propertyType: nullableValue(draft.propertyType),
      region: nullableValue(draft.region),
      province: nullableValue(draft.province),
      city: nullableValue(draft.city),
      bedrooms: nullableIntegerValue(draft.bedrooms),
      bathrooms: nullableIntegerValue(draft.bathrooms),
      areaSqm: nullableIntegerValue(draft.areaSqm),
      currentStatus: nullableValue(draft.currentStatus),
      requestedServices: draft.requestedServices,
      timing: nullableValue(draft.timing),
      propertyDescription: nullableValue(draft.propertyDescription),
      notes: nullableValue(draft.notes),
      nextFollowUpAt: inputToIso(draft.nextFollowUpAt),
    };
    const updated = await updateCrm(
      contactEditor.contact
        ? { action: "update_contact", contactId: contactEditor.contact.id, contact }
        : { action: "create_contact", contact },
      contactEditor.contact ? "Scheda proprietario aggiornata." : "Proprietario aggiunto al CRM.",
    );
    if (updated) setContactEditor(null);
  }

  async function deleteContact(contact: CrmContact) {
    if (!window.confirm(`Eliminare definitivamente ${contact.full_name} dal CRM?`)) return;
    const updated = await updateCrm(
      { action: "delete_contact", contactId: contact.id },
      "Proprietario eliminato dal CRM.",
    );
    if (updated) setContactEditor(null);
  }

  async function saveStage() {
    if (!stageEditor) return;
    const updated = await updateCrm(
      stageEditor.id
        ? {
            action: "update_stage",
            stageId: stageEditor.id,
            name: stageEditor.name,
            color: stageEditor.color,
          }
        : { action: "create_stage", name: stageEditor.name, color: stageEditor.color },
      stageEditor.id ? "Stage aggiornato." : "Nuovo stage aggiunto alla pipeline.",
    );
    if (updated) setStageEditor(null);
  }

  async function moveStage(stageId: string, direction: "left" | "right") {
    await updateCrm(
      { action: "move_stage", stageId, direction },
      "Ordine degli stage aggiornato.",
    );
  }

  async function deleteStage() {
    if (!stageToDelete || !deleteDestinationId) return;
    const updated = await updateCrm(
      {
        action: "delete_stage",
        stageId: stageToDelete.id,
        moveContactsToStageId: deleteDestinationId,
      },
      "Stage eliminato e proprietari spostati.",
    );
    if (updated) {
      setStageToDelete(null);
      setDeleteDestinationId("");
    }
  }

  async function moveContact(contactId: string, stageId: string) {
    const updated = await updateCrm(
      { action: "move_contact", contactId, stageId },
      "Proprietario spostato nella pipeline.",
    );
    if (updated) setDraggingContactId(null);
  }

  if (loading) {
    return <section className="card p-8 text-center text-muted">Carico il CRM...</section>;
  }

  if (!data) {
    return (
      <section className="card p-8 text-center">
        <h2 className="text-xl font-semibold text-ink">CRM non disponibile</h2>
        <p className="mt-2 text-muted">{error || "Riprova tra poco."}</p>
      </section>
    );
  }

  return (
    <div className="grid min-w-0 max-w-full gap-6 overflow-x-clip">
      <section className="card overflow-hidden p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-green">
              <Columns3 size={18} />
              <p className="section-kicker">CRM privato</p>
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-ink">{data.pipeline.name}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Gestisci i proprietari in lavorazione. Trascina una scheda tra le colonne da desktop;
              da mobile puoi aprirla e scegliere lo stage.
            </p>
          </div>
          <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <button
              className="btn btn-secondary w-full sm:w-auto"
              type="button"
              onClick={() => setStageEditor({ name: "", color: "#047857" })}
            >
              <Columns3 size={17} />
              Aggiungi stage
            </button>
            <button
              className="btn btn-primary w-full sm:w-auto"
              type="button"
              onClick={() => openNewContact(data.stages[0]?.id ?? "")}
              disabled={!data.stages.length}
            >
              <Plus size={17} />
              Aggiungi proprietario
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-green">
          {success}
        </p>
      ) : null}

      <section className="min-w-0 max-w-full overflow-x-auto pb-3">
        <div className="grid min-w-max grid-flow-col auto-cols-[minmax(286px,336px)] gap-4">
          {data.stages.map((stage, index) => {
            const stageContacts = data.contacts.filter((contact) => contact.stage_id === stage.id);
            const canMoveLeft = index > 0;
            const canMoveRight = index < data.stages.length - 1;
            return (
              <article
                className={`flex min-h-[420px] flex-col rounded-xl border border-slate-200 bg-slate-100/80 p-3 transition ${
                  draggingContactId ? "border-dashed" : ""
                }`}
                key={stage.id}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const contactId = event.dataTransfer.getData("text/leadhost-crm-contact") || draggingContactId;
                  if (contactId) void moveContact(contactId, stage.id);
                }}
              >
                <div className="flex items-start justify-between gap-2 px-1 pb-3">
                  <div className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-bold text-ink">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} />
                      <span className="truncate">{stage.name}</span>
                    </span>
                    <span className="mt-1 block text-xs font-semibold text-muted">
                      {stageContacts.length} {stageContacts.length === 1 ? "proprietario" : "proprietari"}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      aria-label={`Sposta ${stage.name} a sinistra`}
                      className="grid size-8 place-items-center rounded-md text-slate-500 hover:bg-white hover:text-ink disabled:opacity-30"
                      type="button"
                      disabled={!canMoveLeft || saving}
                      onClick={() => void moveStage(stage.id, "left")}
                    >
                      <ArrowLeft size={15} />
                    </button>
                    <button
                      aria-label={`Sposta ${stage.name} a destra`}
                      className="grid size-8 place-items-center rounded-md text-slate-500 hover:bg-white hover:text-ink disabled:opacity-30"
                      type="button"
                      disabled={!canMoveRight || saving}
                      onClick={() => void moveStage(stage.id, "right")}
                    >
                      <ArrowRight size={15} />
                    </button>
                    <button
                      aria-label={`Modifica ${stage.name}`}
                      className="grid size-8 place-items-center rounded-md text-slate-500 hover:bg-white hover:text-green"
                      type="button"
                      onClick={() => setStageEditor({ id: stage.id, name: stage.name, color: stage.color })}
                    >
                      <Pencil size={15} />
                    </button>
                  </div>
                </div>

                <div className="grid min-h-24 gap-3">
                  {stageContacts.map((contact) => (
                    <ContactCard
                      contact={contact}
                      dragging={draggingContactId === contact.id}
                      key={contact.id}
                      onDragEnd={() => setDraggingContactId(null)}
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/leadhost-crm-contact", contact.id);
                        event.dataTransfer.effectAllowed = "move";
                        setDraggingContactId(contact.id);
                      }}
                      onOpen={() => openContact(contact)}
                    />
                  ))}
                  {!stageContacts.length ? (
                    <div className="grid min-h-24 place-items-center rounded-lg border border-dashed border-slate-300 px-4 text-center text-sm text-slate-400">
                      Trascina qui un proprietario oppure aggiungine uno.
                    </div>
                  ) : null}
                </div>

                <button
                  className="mt-3 flex min-h-10 items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white/70 px-3 text-sm font-bold text-slate-600 transition hover:border-green hover:text-green"
                  type="button"
                  onClick={() => openNewContact(stage.id)}
                >
                  <Plus size={16} />
                  Aggiungi qui
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {contactEditor ? (
        <ContactEditor
          contact={contactEditor.contact}
          draft={contactEditor.draft}
          saving={saving}
          stages={data.stages}
          onChange={(update) =>
            setContactEditor((current) =>
              current ? { ...current, draft: { ...current.draft, ...update } } : current,
            )
          }
          onClose={() => setContactEditor(null)}
          onDelete={() => contactEditor.contact && void deleteContact(contactEditor.contact)}
          onSave={() => void saveContact()}
        />
      ) : null}

      {stageEditor ? (
        <StageEditor
          draft={stageEditor}
          saving={saving}
          onChange={(update) => setStageEditor((current) => (current ? { ...current, ...update } : current))}
          onClose={() => setStageEditor(null)}
          onDelete={() => {
            if (!stageEditor.id) return;
            const stage = data.stages.find((item) => item.id === stageEditor.id) ?? null;
            setStageEditor(null);
            setStageToDelete(stage);
            setDeleteDestinationId(data.stages.find((item) => item.id !== stage?.id)?.id ?? "");
          }}
          onSave={() => void saveStage()}
        />
      ) : null}

      {stageToDelete ? (
        <DeleteStageDialog
          destinations={data.stages.filter((stage) => stage.id !== stageToDelete.id)}
          destinationId={deleteDestinationId}
          saving={saving}
          stage={stageToDelete}
          onCancel={() => setStageToDelete(null)}
          onChangeDestination={setDeleteDestinationId}
          onConfirm={() => void deleteStage()}
        />
      ) : null}
    </div>
  );
}

function ContactCard({
  contact,
  dragging,
  onDragStart,
  onDragEnd,
  onOpen,
}: {
  contact: CrmContact;
  dragging: boolean;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onOpen: () => void;
}) {
  return (
    <button
      className={`group w-full rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-green/40 hover:shadow-md ${
        dragging ? "opacity-40" : ""
      }`}
      draggable
      type="button"
      onClick={onOpen}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 shrink-0 text-slate-300 group-hover:text-green" size={17} />
        <div className="min-w-0 flex-1">
          <p className="break-words font-bold text-ink">{contact.full_name}</p>
          {contact.property_address || contact.city ? (
            <p className="mt-2 flex items-start gap-1.5 text-sm leading-5 text-muted">
              <MapPin className="mt-0.5 shrink-0" size={14} />
              <span className="break-words">{formatPropertyLocation(contact)}</span>
            </p>
          ) : null}
          {contact.next_follow_up_at ? (
            <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-amber-700">
              <CalendarClock size={14} />
              Da ricontattare {formatDate(contact.next_follow_up_at)}
            </p>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function ContactEditor({
  contact,
  draft,
  stages,
  saving,
  onChange,
  onClose,
  onSave,
  onDelete,
}: {
  contact: CrmContact | null;
  draft: ContactDraft;
  stages: CrmStage[];
  saving: boolean;
  onChange: (update: Partial<ContactDraft>) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const regions = useMemo(
    () => mergeOptions(ITALY_GEO.map((item) => item.region), draft.region),
    [draft.region],
  );
  const provinces = useMemo(() => {
    const region = ITALY_GEO.find((item) => item.region === draft.region);
    return mergeOptions(region?.provinces.map((item) => item.province) ?? [], draft.province);
  }, [draft.province, draft.region]);
  const cities = useMemo(() => {
    const region = ITALY_GEO.find((item) => item.region === draft.region);
    const province = region?.provinces.find((item) => item.province === draft.province);
    return mergeOptions(province?.cities ?? [], draft.city);
  }, [draft.city, draft.province, draft.region]);
  const propertyTypes = useMemo(
    () => mergeOptions([...OWNER_PROPERTY_TYPES], draft.propertyType),
    [draft.propertyType],
  );
  const timingOptions = useMemo(
    () => mergeOptions([...OWNER_TIMING_OPTIONS], draft.timing),
    [draft.timing],
  );
  const currentStatusOptions = useMemo(
    () => mergeOptions([...OWNER_CURRENT_STATUS_OPTIONS], draft.currentStatus),
    [draft.currentStatus],
  );
  const requestedServiceOptions = useMemo(
    () => mergeOptions([...OWNER_REQUESTED_SERVICE_OPTIONS], ...draft.requestedServices),
    [draft.requestedServices],
  );

  function toggleRequestedService(service: string) {
    onChange({
      requestedServices: draft.requestedServices.includes(service)
        ? draft.requestedServices.filter((item) => item !== service)
        : [...draft.requestedServices, service],
    });
  }

  return (
    <Modal title={contact ? "Modifica proprietario" : "Nuovo proprietario"} onClose={onClose}>
      <div className="grid gap-6">
        <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2 text-green">
            <UserRound size={18} />
            <h3 className="font-semibold text-ink">Proprietario</h3>
          </div>
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome e cognome *">
                <input className="form-input" value={draft.fullName} onChange={(event) => onChange({ fullName: event.target.value })} />
              </Field>
              <Field label="Stage">
                <select className="form-input" value={draft.stageId} onChange={(event) => onChange({ stageId: event.target.value })}>
                  {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Telefono">
                <input className="form-input" inputMode="tel" value={draft.phone} onChange={(event) => onChange({ phone: event.target.value })} />
              </Field>
              <Field label="Email">
                <input className="form-input" inputMode="email" value={draft.email} onChange={(event) => onChange({ email: event.target.value })} />
              </Field>
            </div>
            <Field label="Da ricontattare il">
              <input className="form-input" type="datetime-local" value={draft.nextFollowUpAt} onChange={(event) => onChange({ nextFollowUpAt: event.target.value })} />
            </Field>
            <Field label="Note sul contatto">
              <textarea className="min-h-24 rounded-lg border border-slate-200 bg-white p-3 text-sm text-ink outline-none focus:border-green" value={draft.notes} onChange={(event) => onChange({ notes: event.target.value })} />
            </Field>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2 text-green">
            <Home size={18} />
            <div>
              <h3 className="font-semibold text-ink">Immobile</h3>
              <p className="mt-0.5 text-xs font-normal text-muted">Facoltativo: aggiungi i dati che ti servono per lavorare il proprietario.</p>
            </div>
          </div>
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tipo di immobile">
                <select className="form-input" value={draft.propertyType} onChange={(event) => onChange({ propertyType: event.target.value })}>
                  <option value="">Seleziona</option>
                  {propertyTypes.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </Field>
              <Field label="Stato attuale">
                <select className="form-input" value={draft.currentStatus} onChange={(event) => onChange({ currentStatus: event.target.value })}>
                  <option value="">Seleziona</option>
                  {currentStatusOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Indirizzo">
              <input className="form-input" value={draft.propertyAddress} onChange={(event) => onChange({ propertyAddress: event.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Regione">
                <select className="form-input" value={draft.region} onChange={(event) => onChange({ region: event.target.value, province: "", city: "" })}>
                  <option value="">Seleziona</option>
                  {regions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </Field>
              <Field label="Provincia">
                <select className="form-input" value={draft.province} disabled={!draft.region} onChange={(event) => onChange({ province: event.target.value, city: "" })}>
                  <option value="">Seleziona</option>
                  {provinces.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </Field>
              <Field label="Città">
                <select className="form-input" value={draft.city} disabled={!draft.province} onChange={(event) => onChange({ city: event.target.value })}>
                  <option value="">Seleziona</option>
                  {cities.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Camere">
                <input className="form-input" inputMode="numeric" min="0" type="number" value={draft.bedrooms} onChange={(event) => onChange({ bedrooms: event.target.value })} />
              </Field>
              <Field label="Bagni">
                <input className="form-input" inputMode="numeric" min="0" type="number" value={draft.bathrooms} onChange={(event) => onChange({ bathrooms: event.target.value })} />
              </Field>
              <Field label="Metratura (mq)">
                <input className="form-input" inputMode="numeric" min="1" type="number" value={draft.areaSqm} onChange={(event) => onChange({ areaSqm: event.target.value })} />
              </Field>
            </div>
            <Field label="Quando vorrebbe iniziare">
              <select className="form-input" value={draft.timing} onChange={(event) => onChange({ timing: event.target.value })}>
                <option value="">Seleziona</option>
                {timingOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </Field>
            <div>
              <p className="text-sm font-semibold text-ink">Servizi richiesti</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {requestedServiceOptions.map((service) => (
                  <label className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700" key={service}>
                    <input checked={draft.requestedServices.includes(service)} className="size-4 accent-emerald-700" type="checkbox" onChange={() => toggleRequestedService(service)} />
                    <span>{service}</span>
                  </label>
                ))}
              </div>
            </div>
            <Field label="Descrizione immobile">
              <textarea className="min-h-28 rounded-lg border border-slate-200 bg-white p-3 text-sm text-ink outline-none focus:border-green" value={draft.propertyDescription} onChange={(event) => onChange({ propertyDescription: event.target.value })} />
            </Field>
          </div>
        </section>

        {contact ? (
          <CrmDocumentsPanel contactId={contact.id} />
        ) : (
          <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-muted sm:p-5">
            Salva prima il proprietario per poter allegare documenti e contratti.
          </section>
        )}
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        {contact ? <button className="btn border border-red-200 bg-red-50 text-red-700 sm:w-auto" type="button" disabled={saving} onClick={onDelete}><Trash2 size={16} />Elimina</button> : <span />}
        <div className="grid gap-2 sm:flex">
          <button className="btn btn-secondary" type="button" disabled={saving} onClick={onClose}>Annulla</button>
          <button className="btn btn-primary" type="button" disabled={saving || draft.fullName.trim().length < 2} onClick={onSave}><Save size={16} />{saving ? "Salvataggio..." : "Salva proprietario"}</button>
        </div>
      </div>
    </Modal>
  );
}

function CrmDocumentsPanel({ contactId }: { contactId: string }) {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [documents, setDocuments] = useState<CrmDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const getToken = useCallback(async () => {
    const { data: session } = await supabase.auth.getSession();
    return session.session?.access_token ?? null;
  }, [supabase]);

  const request = useCallback(async (body?: Record<string, unknown>) => {
    const token = await getToken();
    if (!token) throw new Error("Sessione non disponibile. Effettua nuovamente l'accesso.");
    const response = await fetch(
      body ? "/api/marketing/crm/documents" : `/api/marketing/crm/documents?contactId=${contactId}`,
      {
        method: body ? "POST" : "GET",
        headers: body
          ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
          : { Authorization: `Bearer ${token}` },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    const payload = (await response.json()) as { error?: string; documents?: CrmDocument[]; storagePath?: string; token?: string };
    if (!response.ok) throw new Error(payload.error ?? "Operazione sui documenti non riuscita.");
    return payload;
  }, [contactId, getToken]);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await request();
      setDocuments(payload.documents ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Non riesco a caricare i documenti.");
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDocuments(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDocuments]);

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    const candidates = Array.from(files);
    const allowedTypes = new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]);
    const invalid = candidates.find((file) => !allowedTypes.has(file.type) || file.size > 10 * 1024 * 1024);
    if (invalid) {
      setError("Sono ammessi solo PDF, DOC e DOCX fino a 10 MB per file.");
      return;
    }
    if (documents.length + candidates.length > 10) {
      setError("Puoi allegare al massimo 10 documenti per proprietario.");
      return;
    }

    setUploading(true);
    setError("");
    setMessage("");
    try {
      for (const file of candidates) {
        const upload = await request({
          action: "create_upload",
          contactId,
          fileName: file.name,
          contentType: file.type,
          byteSize: file.size,
        });
        if (!upload.storagePath || !upload.token) throw new Error("Upload documento non disponibile.");
        const { error: uploadError } = await supabase.storage
          .from("marketing-crm-documents")
          .uploadToSignedUrl(upload.storagePath, upload.token, file, { contentType: file.type });
        if (uploadError) throw uploadError;
        await request({
          action: "complete_upload",
          contactId,
          storagePath: upload.storagePath,
          fileName: file.name,
          contentType: file.type,
          byteSize: file.size,
        });
      }
      await loadDocuments();
      setMessage(candidates.length === 1 ? "Documento allegato." : "Documenti allegati.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload documento non riuscito.");
    } finally {
      setUploading(false);
    }
  }

  async function deleteDocument(document: CrmDocument) {
    if (!window.confirm(`Eliminare definitivamente ${document.original_name}?`)) return;
    setError("");
    setMessage("");
    try {
      await request({ action: "delete_document", documentId: document.id });
      await loadDocuments();
      setMessage("Documento eliminato.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Eliminazione documento non riuscita.");
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2 text-green">
          <FileText size={18} />
          <div>
            <h3 className="font-semibold text-ink">Documenti e contratti</h3>
            <p className="mt-0.5 text-xs font-normal text-muted">PDF, DOC o DOCX, massimo 10 MB per file.</p>
          </div>
        </div>
        <label className={`btn btn-secondary cursor-pointer sm:w-auto ${uploading ? "pointer-events-none opacity-60" : ""}`}>
          {uploading ? <LoaderCircle className="animate-spin" size={16} /> : <Upload size={16} />}
          {uploading ? "Caricamento..." : "Allega documenti"}
          <input accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" disabled={uploading} multiple type="file" onChange={(event) => { void uploadFiles(event.target.files); event.currentTarget.value = ""; }} />
        </label>
      </div>
      {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {message ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-green">{message}</p> : null}
      {loading ? <p className="mt-4 text-sm text-muted">Carico i documenti...</p> : null}
      {!loading && !documents.length ? <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-muted">Nessun documento allegato.</p> : null}
      <div className="mt-4 grid gap-2">
        {documents.map((document) => (
          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between" key={document.id}>
            <div className="min-w-0 flex items-center gap-3">
              <FileText className="shrink-0 text-slate-500" size={18} />
              <div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{document.original_name}</p><p className="mt-0.5 text-xs text-muted">{formatFileSize(document.byte_size)} · {formatDocumentDate(document.created_at)}</p></div>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
              <a className="btn btn-secondary min-h-9 px-3 text-xs" href={document.download_url} rel="noreferrer" target="_blank"><Download size={15} />Apri</a>
              <button className="btn min-h-9 border border-red-200 bg-red-50 px-3 text-xs text-red-700" type="button" disabled={uploading} onClick={() => void deleteDocument(document)}><Trash2 size={15} />Elimina</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StageEditor({ draft, saving, onChange, onClose, onSave, onDelete }: {
  draft: StageDraft; saving: boolean; onChange: (update: Partial<StageDraft>) => void; onClose: () => void; onSave: () => void; onDelete: () => void;
}) {
  return (
    <Modal title={draft.id ? "Modifica stage" : "Nuovo stage"} onClose={onClose}>
      <div className="grid gap-4">
        <Field label="Nome stage *"><input className="form-input" value={draft.name} onChange={(event) => onChange({ name: event.target.value })} /></Field>
        <div><p className="text-sm font-semibold text-ink">Colore</p><div className="mt-3 flex flex-wrap gap-2">{stageColors.map((color) => <button aria-label={`Colore ${color}`} className={`size-9 rounded-full border-2 ${draft.color === color ? "border-ink" : "border-white"}`} key={color} style={{ backgroundColor: color }} type="button" onClick={() => onChange({ color })} />)}</div></div>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        {draft.id ? <button className="btn border border-red-200 bg-red-50 text-red-700" type="button" disabled={saving} onClick={onDelete}><Trash2 size={16} />Elimina stage</button> : <span />}
        <div className="grid gap-2 sm:flex"><button className="btn btn-secondary" type="button" disabled={saving} onClick={onClose}>Annulla</button><button className="btn btn-primary" type="button" disabled={saving || draft.name.trim().length < 2} onClick={onSave}><Save size={16} />{saving ? "Salvataggio..." : "Salva stage"}</button></div>
      </div>
    </Modal>
  );
}

function DeleteStageDialog({ stage, destinations, destinationId, saving, onCancel, onChangeDestination, onConfirm }: {
  stage: CrmStage; destinations: CrmStage[]; destinationId: string; saving: boolean; onCancel: () => void; onChangeDestination: (value: string) => void; onConfirm: () => void;
}) {
  return (
    <Modal title="Elimina stage" onClose={onCancel}>
      <p className="text-sm leading-6 text-muted">I proprietari presenti in <strong className="text-ink">{stage.name}</strong> verranno spostati nello stage scelto. L&apos;operazione non elimina i proprietari.</p>
      <div className="mt-5"><Field label="Sposta i proprietari in"><select className="form-input" value={destinationId} onChange={(event) => onChangeDestination(event.target.value)}>{destinations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></div>
      <div className="mt-6 grid gap-2 border-t border-slate-200 pt-4 sm:flex sm:justify-end"><button className="btn btn-secondary" type="button" disabled={saving} onClick={onCancel}>Annulla</button><button className="btn border border-red-300 bg-red-600 text-white" type="button" disabled={saving || !destinationId} onClick={onConfirm}><Trash2 size={16} />{saving ? "Eliminazione..." : "Elimina stage"}</button></div>
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-[120] grid items-end bg-ink/35 p-0 backdrop-blur-sm sm:place-items-center sm:p-6"><section aria-modal="true" className="max-h-[92dvh] w-full overflow-y-auto rounded-t-xl bg-white shadow-[0_30px_90px_rgba(15,23,42,0.28)] sm:max-w-2xl sm:rounded-xl" role="dialog"><header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4"><h2 className="text-lg font-semibold text-ink">{title}</h2><button aria-label="Chiudi" className="grid size-10 place-items-center rounded-lg border border-slate-200 text-slate-600" type="button" onClick={onClose}><X size={19} /></button></header><div className="p-5">{children}</div></section></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-2 text-sm font-semibold text-ink"><span>{label}</span>{children}</label>; }

function emptyContactDraft(stageId: string): ContactDraft {
  return {
    stageId,
    fullName: "",
    email: "",
    phone: "",
    propertyAddress: "",
    propertyType: "",
    region: "",
    province: "",
    city: "",
    bedrooms: "",
    bathrooms: "",
    areaSqm: "",
    currentStatus: "",
    requestedServices: [],
    timing: "",
    propertyDescription: "",
    notes: "",
    nextFollowUpAt: "",
  };
}

function contactToDraft(contact: CrmContact): ContactDraft {
  return {
    stageId: contact.stage_id,
    fullName: contact.full_name,
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    propertyAddress: contact.property_address ?? "",
    propertyType: contact.property_type ?? "",
    region: contact.region ?? "",
    province: contact.province ?? "",
    city: contact.city ?? "",
    bedrooms: contact.bedrooms?.toString() ?? "",
    bathrooms: contact.bathrooms?.toString() ?? "",
    areaSqm: contact.area_sqm?.toString() ?? "",
    currentStatus: contact.current_status ?? "",
    requestedServices: contact.requested_services ?? [],
    timing: contact.timing ?? "",
    propertyDescription: contact.property_description ?? "",
    notes: contact.notes ?? "",
    nextFollowUpAt: isoToInput(contact.next_follow_up_at),
  };
}

function mergeOptions(values: readonly string[], ...selectedValues: string[]) {
  return Array.from(new Set([...values, ...selectedValues.filter(Boolean)]));
}

function nullableValue(value: string) { const trimmed = value.trim(); return trimmed || null; }
function nullableIntegerValue(value: string) { const trimmed = value.trim(); return trimmed ? Number.parseInt(trimmed, 10) : null; }
function formatPropertyLocation(contact: CrmContact) { return [contact.city, contact.property_address].filter(Boolean).join(", "); }
function formatFileSize(bytes: number) { return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`; }
function formatDocumentDate(value: string) { return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)); }
function inputToIso(value: string) { return value ? new Date(value).toISOString() : null; }
function isoToInput(value: string | null) { if (!value) return ""; const date = new Date(value); const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
function formatDate(value: string) { return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
