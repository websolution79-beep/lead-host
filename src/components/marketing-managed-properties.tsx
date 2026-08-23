"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, LoaderCircle, MapPin, Plus, Search, UserRound, X } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { OWNER_PROPERTY_TYPES } from "@/lib/owner-requests/options";

type ManagedProperty = {
  id: string; name: string; property_type: string | null; property_address: string | null;
  city: string | null; owner_full_name: string | null; cover_image_url: string | null; updated_at: string;
};
type Payload = { properties: ManagedProperty[]; cities: string[]; propertyTypes: string[]; error?: string };
type Draft = { name: string; propertyType: string; city: string; propertyAddress: string; ownerFullName: string; ownerEmail: string; ownerPhone: string };
const initialDraft: Draft = { name: "", propertyType: "", city: "", propertyAddress: "", ownerFullName: "", ownerEmail: "", ownerPhone: "" };

export function MarketingManagedProperties() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [creating, setCreating] = useState(false);

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token ?? null, [supabase]);
  const load = useCallback(async () => {
    const accessToken = await token();
    if (!accessToken) { setError("Sessione non disponibile. Effettua nuovamente l'accesso."); setLoading(false); return; }
    const response = await fetch("/api/marketing/immobili", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    const payload = await response.json() as Payload;
    if (!response.ok) setError(payload.error ?? "Non riesco a caricare gli immobili."); else setData(payload);
    setLoading(false);
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const filtered = (data?.properties ?? []).filter((property) => {
    const haystack = [property.name, property.property_type, property.city, property.property_address, property.owner_full_name].filter(Boolean).join(" ").toLowerCase();
    return (!search || haystack.includes(search.trim().toLowerCase())) && (!city || property.city === city) && (!propertyType || property.property_type === propertyType);
  });
  const typeOptions = data?.propertyTypes.length ? data.propertyTypes : OWNER_PROPERTY_TYPES;

  async function createProperty() {
    const accessToken = await token(); if (!accessToken) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/marketing/immobili", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({
        name: draft.name, propertyType: nullable(draft.propertyType), propertyAddress: nullable(draft.propertyAddress), region: null, province: null, city: nullable(draft.city), bedrooms: null, bathrooms: null, beds: null, areaSqm: null, ownerFullName: nullable(draft.ownerFullName), ownerEmail: nullable(draft.ownerEmail), ownerPhone: nullable(draft.ownerPhone), ownerNotes: null, operationalNotes: null,
      }) });
      const payload = await response.json() as { property?: ManagedProperty; error?: string };
      if (!response.ok || !payload.property) { setError(payload.error ?? "Non riesco a creare l'immobile."); return; }
      setCreating(false); setDraft(initialDraft); await load(); window.location.assign(`/app/marketing/immobili/${payload.property.id}`);
    } finally { setSaving(false); }
  }

  if (loading) return <LoadingState />;
  return (
    <div className="grid gap-6">
      <section className="card p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="section-kicker">Archivio operativo</p><h2 className="mt-2 text-2xl font-semibold text-ink">I tuoi immobili</h2><p className="mt-2 text-sm leading-6 text-muted">Tieni in un unico posto proprietari, contatti, manutenzioni, documenti e link agli annunci.</p></div>
          <button className="btn btn-primary w-full sm:w-auto" onClick={() => setCreating(true)} type="button"><Plus size={18} />Aggiungi immobile</button>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_200px]">
          <label className="relative block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input className="field w-full pl-10" onChange={(event) => setSearch(event.target.value)} placeholder="Cerca nome, proprietario, città o indirizzo" value={search} /></label>
          <select className="field w-full" onChange={(event) => setCity(event.target.value)} value={city}><option value="">Tutte le città</option>{data?.cities.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select className="field w-full" onChange={(event) => setPropertyType(event.target.value)} value={propertyType}><option value="">Tutte le tipologie</option>{typeOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        </div>
      </section>
      {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p> : null}
      {filtered.length ? <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{filtered.map((property) => <PropertyCard key={property.id} property={property} />)}</section> : <EmptyState onCreate={() => setCreating(true)} />}
      {creating ? <CreateModal draft={draft} saving={saving} onChange={setDraft} onClose={() => { if (!saving) setCreating(false); }} onSave={() => void createProperty()} /> : null}
    </div>
  );
}

function PropertyCard({ property }: { property: ManagedProperty }) {
  return <Link className="group overflow-hidden rounded-lg border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-lg" href={`/app/marketing/immobili/${property.id}`}>
    <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-emerald-50 via-slate-100 to-slate-200">{property.cover_image_url ? <img alt={`Copertina ${property.name}`} className="size-full object-cover transition duration-300 group-hover:scale-[1.02]" src={property.cover_image_url} /> : <div className="grid h-full place-items-center text-emerald-700"><Building2 size={44} strokeWidth={1.5} /></div>}</div>
    <div className="p-5"><p className="text-xs font-bold uppercase text-emerald-700">{property.property_type || "Immobile"}</p><h3 className="mt-2 text-xl font-semibold text-ink">{property.name}</h3><p className="mt-3 flex min-h-6 items-start gap-2 text-sm leading-6 text-muted"><MapPin className="mt-0.5 shrink-0 text-slate-400" size={16} />{[property.city, property.property_address].filter(Boolean).join(", ") || "Indirizzo non indicato"}</p><p className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-600"><UserRound size={16} className="text-slate-400" />{property.owner_full_name || "Proprietario non indicato"}</p></div>
  </Link>;
}
function CreateModal({ draft, saving, onChange, onClose, onSave }: { draft: Draft; saving: boolean; onChange: (draft: Draft) => void; onClose: () => void; onSave: () => void }) {
  const set = (key: keyof Draft, value: string) => onChange({ ...draft, [key]: value });
  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-950/45 p-3 sm:p-8">
      <div className="mx-auto my-3 max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 sm:p-7">
          <div>
            <p className="section-kicker">Nuovo immobile</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">Aggiungi un immobile gestito</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Inserisci le informazioni essenziali. Potrai completare contatti, documenti e manutenzioni nella scheda dopo il salvataggio.</p>
          </div>
          <button aria-label="Chiudi" className="rounded-md p-2 text-slate-500 hover:bg-slate-100" onClick={onClose} type="button"><X size={20} /></button>
        </div>
        <div className="grid gap-7 p-5 sm:p-7">
          <section className="rounded-lg border border-emerald-100 bg-emerald-50/45 p-4 sm:p-5">
            <div className="mb-4"><p className="text-sm font-bold text-emerald-900">Informazioni immobile</p><p className="mt-1 text-xs leading-5 text-emerald-800">Il nome interno serve per riconoscere facilmente l’immobile.</p></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome immobile *" value={draft.name} onChange={(value) => set("name", value)} placeholder="Es. Casa Vista Mare" />
              <SelectField label="Tipologia" value={draft.propertyType} onChange={(value) => set("propertyType", value)} options={OWNER_PROPERTY_TYPES} />
              <Field label="Città" value={draft.city} onChange={(value) => set("city", value)} placeholder="Es. Roma" />
              <Field label="Indirizzo" value={draft.propertyAddress} onChange={(value) => set("propertyAddress", value)} placeholder="Es. Via del Corso 10" />
            </div>
          </section>
          <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
            <div className="mb-4"><p className="text-sm font-bold text-ink">Proprietario</p><p className="mt-1 text-xs leading-5 text-muted">Questi dati restano privati e visibili solo nel tuo spazio.</p></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome e cognome" value={draft.ownerFullName} onChange={(value) => set("ownerFullName", value)} placeholder="Es. Mario Rossi" />
              <Field label="Telefono" value={draft.ownerPhone} onChange={(value) => set("ownerPhone", value)} placeholder="Es. 333 1234567" />
              <div className="sm:col-span-2"><Field label="Email" type="email" value={draft.ownerEmail} onChange={(value) => set("ownerEmail", value)} placeholder="Es. mario@email.it" /></div>
            </div>
          </section>
        </div>
        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50/70 p-5 sm:flex-row sm:justify-end sm:p-6"><button className="btn btn-secondary" disabled={saving} onClick={onClose} type="button">Annulla</button><button className="btn btn-primary" disabled={saving || draft.name.trim().length < 2} onClick={onSave} type="button">{saving ? <LoaderCircle className="animate-spin" size={18} /> : <Plus size={18} />}Crea immobile</button></div>
      </div>
    </div>
  );
}
function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) { return <label className="grid gap-2 text-sm font-semibold text-ink"><span>{label}</span><input className="field field-prominent" onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type={type} value={value} /></label>; }
function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: readonly string[] }) { return <label className="grid gap-2 text-sm font-semibold text-ink"><span>{label}</span><select className="field field-prominent" onChange={(event) => onChange(event.target.value)} value={value}><option value="">Seleziona una tipologia</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>; }
function EmptyState({ onCreate }: { onCreate: () => void }) { return <section className="card grid min-h-64 place-items-center p-8 text-center"><div><span className="mx-auto grid size-14 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><Building2 size={28} /></span><h2 className="mt-5 text-xl font-semibold text-ink">Nessun immobile inserito</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted">Aggiungi il primo immobile già acquisito per organizzare dati, fornitori, documenti e manutenzioni.</p><button className="btn btn-primary mt-6" onClick={onCreate} type="button"><Plus size={18} />Aggiungi immobile</button></div></section>; }
function LoadingState() { return <section className="card grid min-h-64 place-items-center text-muted"><span className="inline-flex items-center gap-2"><LoaderCircle className="animate-spin" size={18} />Carico gli immobili…</span></section>; }
function nullable(value: string) { return value.trim() || null; }
