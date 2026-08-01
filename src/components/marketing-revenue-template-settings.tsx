"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Building2, ImageIcon, ReceiptText, Save, SlidersHorizontal } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

type RevenueTemplate = {
  id: string; profile_id: string; report_title: string; brand_name: string | null; header_text: string | null; contact_details: string | null; logo_path: string | null;
  days_available: number; pm_fee_rate: number; airbnb_mix_rate: number; booking_mix_rate: number; direct_mix_rate: number;
  airbnb_commission_rate: number; booking_commission_rate: number; direct_commission_rate: number; ota_vat_rate: number; pm_vat_rate: number; tax_rate: number;
  ota_cost_label: string; management_cost_label: string; tax_cost_label: string; disclaimer: string;
};
type TemplateDraft = {
  reportTitle: string; brandName: string; headerText: string; contactDetails: string; logoPath: string; daysAvailable: string; pmFeeRate: string;
  airbnbMixRate: string; bookingMixRate: string; directMixRate: string; airbnbCommissionRate: string; bookingCommissionRate: string; directCommissionRate: string;
  otaVatRate: string; pmVatRate: string; taxRate: string; otaCostLabel: string; managementCostLabel: string; taxCostLabel: string; disclaimer: string;
};

export function MarketingRevenueTemplateSettings() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [template, setTemplate] = useState<RevenueTemplate | null>(null);
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadTemplate = useCallback(async () => {
    const token = await getToken();
    if (!token) { setError("Sessione non disponibile. Effettua nuovamente l'accesso."); setLoading(false); return; }
    const response = await fetch("/api/marketing/revenue-template", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const payload = (await response.json()) as { error?: string; template?: RevenueTemplate; logoUrl?: string | null };
    if (!response.ok || !payload.template) { setError(payload.error ?? "Non riesco a caricare il modello."); setLoading(false); return; }
    setTemplate(payload.template); setDraft(toDraft(payload.template)); setLogoUrl(payload.logoUrl ?? null); setLoading(false);
  }, [getToken]);

  useEffect(() => { const timer = window.setTimeout(() => void loadTemplate(), 0); return () => window.clearTimeout(timer); }, [loadTemplate]);

  function update<K extends keyof TemplateDraft>(key: K, value: TemplateDraft[K]) { setDraft((current) => current ? { ...current, [key]: value } : current); }

  async function uploadLogo(file: File | null) {
    if (!file || !template) return;
    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type) || file.size > 2 * 1024 * 1024) { setError("Usa JPG, PNG o WebP sotto 2 MB."); return; }
    const extension = file.name.split(".").pop()?.toLowerCase() || "webp";
    const path = `${template.profile_id}/logo-${Date.now()}.${extension}`;
    setSaving(true); setError("");
    const { error: uploadError } = await supabase.storage.from("marketing-revenue-branding").upload(path, file, { contentType: file.type });
    setSaving(false);
    if (uploadError) { setError("Upload logo non riuscito. Riprova."); return; }
    update("logoPath", path); setLogoUrl(URL.createObjectURL(file)); setMessage("Logo pronto: salva il modello per confermarlo.");
  }

  async function save() {
    if (!draft) return;
    const payload = toPayload(draft);
    if (Math.abs(payload.airbnbMixRate + payload.bookingMixRate + payload.directMixRate - 1) > 0.0001) { setError("Il mix Airbnb, Booking e diretto deve totalizzare il 100%."); return; }
    setSaving(true); setError(""); setMessage("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Sessione non disponibile. Effettua nuovamente l'accesso.");
      const response = await fetch("/api/marketing/revenue-template", { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = (await response.json()) as { error?: string; template?: RevenueTemplate };
      if (!response.ok || !result.template) throw new Error(result.error ?? "Salvataggio modello non riuscito.");
      setTemplate(result.template); setDraft(toDraft(result.template)); setMessage("Modello predefinito aggiornato.");
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Salvataggio modello non riuscito."); } finally { setSaving(false); }
  }

  if (loading) return <section className="card p-8 text-center text-muted">Carico il modello predefinito...</section>;
  if (!draft) return <section className="card p-8 text-center text-red-700">{error || "Il modello non è disponibile."}</section>;

  return <div className="grid gap-6">
    <section className="card p-5 sm:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="section-kicker">Configurazione base</p><h2 className="mt-2 text-2xl font-semibold text-ink">Modello predefinito PM</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Questi valori compilano una nuova stima. Potrai modificarli integralmente per ogni immobile, senza cambiare il modello.</p></div><button className="btn btn-primary" type="button" disabled={saving} onClick={() => void save()}><Save size={16} />{saving ? "Salvataggio..." : "Salva modello"}</button></div></section>
    {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p> : null}
    {message ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-green">{message}</p> : null}
    <section className="card p-5 sm:p-6"><SectionTitle icon={<Building2 size={18} />} title="Identità nel report" /><div className="mt-5 grid gap-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Titolo relazione *"><input className="form-input" value={draft.reportTitle} onChange={(event) => update("reportTitle", event.target.value)} /></Field><Field label="Nome attività"><input className="form-input" value={draft.brandName} onChange={(event) => update("brandName", event.target.value)} /></Field></div><Field label="Intestazione"><input className="form-input" value={draft.headerText} onChange={(event) => update("headerText", event.target.value)} placeholder="Es. Consulenza per affitti brevi" /></Field><Field label="Dati di contatto"><textarea className="form-input min-h-24" value={draft.contactDetails} onChange={(event) => update("contactDetails", event.target.value)} placeholder="Email, telefono, sito web o altri recapiti" /></Field><div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center"><div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-white">{logoUrl ? <img alt="Logo report" className="size-full object-contain p-1" src={logoUrl} /> : <ImageIcon className="text-slate-400" size={22} />}</div><div className="min-w-0 flex-1"><p className="font-semibold text-ink">Logo opzionale</p><p className="mt-1 text-xs text-muted">JPG, PNG o WebP fino a 2 MB.</p></div><label className="btn btn-secondary cursor-pointer sm:w-auto">Carica logo<input accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={saving} type="file" onChange={(event) => { void uploadLogo(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} /></label></div></div></section>
    <section className="card p-5 sm:p-6"><SectionTitle icon={<SlidersHorizontal size={18} />} title="Parametri economici predefiniti" /><div className="mt-5 grid gap-6"><div className="grid gap-4 sm:grid-cols-2"><NumberField label="Giorni disponibili" suffix="giorni" value={draft.daysAvailable} onChange={(value) => update("daysAvailable", value)} /><NumberField label="Fee Property Manager" suffix="%" value={draft.pmFeeRate} onChange={(value) => update("pmFeeRate", value)} /></div><div><p className="text-sm font-semibold text-ink">Mix canali</p><div className="mt-3 grid gap-4 sm:grid-cols-3"><NumberField label="Airbnb" suffix="%" value={draft.airbnbMixRate} onChange={(value) => update("airbnbMixRate", value)} /><NumberField label="Booking" suffix="%" value={draft.bookingMixRate} onChange={(value) => update("bookingMixRate", value)} /><NumberField label="Diretto" suffix="%" value={draft.directMixRate} onChange={(value) => update("directMixRate", value)} /></div></div><div><p className="text-sm font-semibold text-ink">Commissioni OTA</p><div className="mt-3 grid gap-4 sm:grid-cols-3"><NumberField label="Airbnb" suffix="%" value={draft.airbnbCommissionRate} onChange={(value) => update("airbnbCommissionRate", value)} /><NumberField label="Booking" suffix="%" value={draft.bookingCommissionRate} onChange={(value) => update("bookingCommissionRate", value)} /><NumberField label="Diretto" suffix="%" value={draft.directCommissionRate} onChange={(value) => update("directCommissionRate", value)} /></div></div><div className="grid gap-4 sm:grid-cols-3"><NumberField label="IVA OTA" suffix="%" value={draft.otaVatRate} onChange={(value) => update("otaVatRate", value)} /><NumberField label="IVA PM" suffix="%" value={draft.pmVatRate} onChange={(value) => update("pmVatRate", value)} /><NumberField label="Aliquota fiscale" suffix="%" value={draft.taxRate} onChange={(value) => update("taxRate", value)} /></div></div></section>
    <section className="card p-5 sm:p-6"><SectionTitle icon={<ReceiptText size={18} />} title="Voci e nota nel report" /><div className="mt-5 grid gap-4"><div className="grid gap-4 sm:grid-cols-3"><Field label="Voce commissioni OTA *"><input className="form-input" value={draft.otaCostLabel} onChange={(event) => update("otaCostLabel", event.target.value)} /></Field><Field label="Voce gestione PM *"><input className="form-input" value={draft.managementCostLabel} onChange={(event) => update("managementCostLabel", event.target.value)} /></Field><Field label="Voce imposte *"><input className="form-input" value={draft.taxCostLabel} onChange={(event) => update("taxCostLabel", event.target.value)} /></Field></div><Field label="Disclaimer *"><textarea className="form-input min-h-32" value={draft.disclaimer} onChange={(event) => update("disclaimer", event.target.value)} /></Field></div></section>
  </div>;
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) { return <div className="flex items-center gap-2 text-green">{icon}<h3 className="font-semibold text-ink">{title}</h3></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-2 text-sm font-semibold text-ink"><span>{label}</span>{children}</label>; }
function NumberField({ label, suffix, value, onChange }: { label: string; suffix: string; value: string; onChange: (value: string) => void }) { return <Field label={label}><div className="relative"><input className="form-input pr-12" inputMode="decimal" type="text" value={value} onChange={(event) => onChange(event.target.value)} /><span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm font-semibold text-muted">{suffix}</span></div></Field>; }
function toDraft(template: RevenueTemplate): TemplateDraft { return { reportTitle: template.report_title, brandName: template.brand_name ?? "", headerText: template.header_text ?? "", contactDetails: template.contact_details ?? "", logoPath: template.logo_path ?? "", daysAvailable: String(template.days_available), pmFeeRate: formatPercent(template.pm_fee_rate), airbnbMixRate: formatPercent(template.airbnb_mix_rate), bookingMixRate: formatPercent(template.booking_mix_rate), directMixRate: formatPercent(template.direct_mix_rate), airbnbCommissionRate: formatPercent(template.airbnb_commission_rate), bookingCommissionRate: formatPercent(template.booking_commission_rate), directCommissionRate: formatPercent(template.direct_commission_rate), otaVatRate: formatPercent(template.ota_vat_rate), pmVatRate: formatPercent(template.pm_vat_rate), taxRate: formatPercent(template.tax_rate), otaCostLabel: template.ota_cost_label, managementCostLabel: template.management_cost_label, taxCostLabel: template.tax_cost_label, disclaimer: template.disclaimer }; }
function toPayload(draft: TemplateDraft) { const number = (value: string) => Number(value.replace(",", ".")); const percent = (value: string) => number(value) / 100; return { reportTitle: draft.reportTitle, brandName: nullable(draft.brandName), headerText: nullable(draft.headerText), contactDetails: nullable(draft.contactDetails), logoPath: nullable(draft.logoPath), daysAvailable: number(draft.daysAvailable), pmFeeRate: percent(draft.pmFeeRate), airbnbMixRate: percent(draft.airbnbMixRate), bookingMixRate: percent(draft.bookingMixRate), directMixRate: percent(draft.directMixRate), airbnbCommissionRate: percent(draft.airbnbCommissionRate), bookingCommissionRate: percent(draft.bookingCommissionRate), directCommissionRate: percent(draft.directCommissionRate), otaVatRate: percent(draft.otaVatRate), pmVatRate: percent(draft.pmVatRate), taxRate: percent(draft.taxRate), otaCostLabel: draft.otaCostLabel, managementCostLabel: draft.managementCostLabel, taxCostLabel: draft.taxCostLabel, disclaimer: draft.disclaimer }; }
function formatPercent(value: number) { return String(Math.round(value * 10000) / 100); }
function nullable(value: string) { return value.trim() || null; }
