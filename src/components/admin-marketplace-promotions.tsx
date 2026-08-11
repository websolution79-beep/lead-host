"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgePercent,
  CalendarClock,
  Copy,
  Pencil,
  Play,
  Plus,
  Square,
  Trash2,
  XCircle,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { formatCurrencyCents } from "@/lib/auth/roles";
import type {
  MarketplacePromotion,
  MarketplacePromotionRule,
  MarketplacePromotionStatus,
  PromotionPurchaseMode,
} from "@/lib/config/marketplace-promotions";

type PromotionView = MarketplacePromotion & {
  effectiveStatus: MarketplacePromotionStatus;
};

type AvailableLead = {
  id: string;
  title: string;
  shared_price_cents: number;
  exclusive_price_cents: number;
};

type PromotionsResponse = {
  promotions: PromotionView[];
  availableLeads: AvailableLead[];
  storageReady: boolean;
  error?: string;
};

type Draft = {
  name: string;
  startsAt: string;
  endsAt: string;
  applyShared: boolean;
  applyExclusive: boolean;
  rules: MarketplacePromotionRule[];
};

const initialDraft = (): Draft => ({
  name: "Giornata Promo Lead Host",
  startsAt: "",
  endsAt: "",
  applyShared: false,
  applyExclusive: true,
  rules: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      mode: "exclusive",
      basePriceCents: 5000,
      promotionalPriceCents: 3000,
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      mode: "exclusive",
      basePriceCents: 7500,
      promotionalPriceCents: 5000,
    },
  ],
});

export function AdminMarketplacePromotions() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [promotions, setPromotions] = useState<PromotionView[]>([]);
  const [availableLeads, setAvailableLeads] = useState<AvailableLead[]>([]);
  const [storageReady, setStorageReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);

  const load = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setError("Sessione admin non trovata.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/admin/settings/marketplace-promotions", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json()) as PromotionsResponse;

    if (!response.ok) {
      setError(payload.error ?? "Non riesco a caricare le promozioni.");
    } else {
      setPromotions(payload.promotions);
      setAvailableLeads(payload.availableLeads);
      setStorageReady(payload.storageReady);
    }
    setLoading(false);
  }, [getToken]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void load(), 0);

    return () => window.clearTimeout(timeoutId);
  }, [load]);

  const preview = useMemo(() => calculatePreview(draft, availableLeads), [draft, availableLeads]);

  async function createPromotion(targetStatus: "draft" | "scheduled" | "active") {
    const token = await getToken();
    setError("");
    setSuccess("");

    if (!token) {
      setError("Sessione admin non trovata.");
      return;
    }

    if (targetStatus === "scheduled" && (!draft.startsAt || !draft.endsAt)) {
      setError("Inserisci data e ora di inizio e fine per programmare la promozione.");
      return;
    }

    if (!window.confirm(confirmMessage(targetStatus, preview.leadCount))) return;

    setSaving(true);
    const response = await fetch("/api/admin/settings/marketplace-promotions", {
      method: editingId ? "PUT" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...(editingId ? { id: editingId } : {}),
        name: draft.name,
        startsAt: toIsoOrNull(draft.startsAt),
        endsAt: toIsoOrNull(draft.endsAt),
        applyShared: draft.applyShared,
        applyExclusive: draft.applyExclusive,
        rules: draft.rules.filter((rule) =>
          rule.mode === "shared" ? draft.applyShared : draft.applyExclusive,
        ),
        targetStatus,
      }),
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Operazione non riuscita.");
    } else {
      setSuccess(
        targetStatus === "active"
          ? "Promozione attivata. Il Marketplace usa già i prezzi promozionali."
          : targetStatus === "scheduled"
            ? "Promozione programmata."
            : "Bozza salvata.",
      );
      setDraft(initialDraft());
      setEditingId(null);
      await load();
    }
    setSaving(false);
  }

  async function runAction(
    promotion: PromotionView,
    action: "activate" | "end" | "cancel",
  ) {
    const token = await getToken();
    if (!token) return;

    const label = action === "activate" ? "attivare" : action === "end" ? "terminare" : "annullare";
    if (!window.confirm(`Confermi di ${label} “${promotion.name}”?`)) return;

    setSaving(true);
    setError("");
    setSuccess("");
    const response = await fetch("/api/admin/settings/marketplace-promotions", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: promotion.id, action }),
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Operazione non riuscita.");
    } else {
      setSuccess(
        action === "activate"
          ? "Promozione attivata."
          : action === "end"
            ? "Promozione terminata: i prezzi normali sono nuovamente attivi."
            : "Programmazione annullata.",
      );
      await load();
    }
    setSaving(false);
  }

  function duplicate(promotion: PromotionView) {
    setEditingId(null);
    setDraft({
      name: `${promotion.name} - copia`,
      startsAt: "",
      endsAt: "",
      applyShared: promotion.apply_shared,
      applyExclusive: promotion.apply_exclusive,
      rules: promotion.rules.map((rule) => ({ ...rule, id: crypto.randomUUID() })),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function edit(promotion: PromotionView) {
    setEditingId(promotion.id);
    setDraft({
      name: promotion.name,
      startsAt: toLocalDateTime(promotion.starts_at),
      endsAt: toLocalDateTime(promotion.ends_at),
      applyShared: promotion.apply_shared,
      applyExclusive: promotion.apply_exclusive,
      rules: promotion.rules.map((rule) => ({ ...rule })),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (loading) {
    return <section className="card p-8 text-center text-muted">Carico promozioni...</section>;
  }

  return (
    <div className="grid gap-6">
      {!storageReady ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-900">
          Applica la migration <code>202608110001_marketplace_price_promotions.sql</code> per attivare questa funzione.
        </section>
      ) : null}

      {error ? <Notice tone="error">{error}</Notice> : null}
      {success ? <Notice tone="success">{success}</Notice> : null}

      <section className="card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <BadgePercent size={22} />
          </span>
          <div>
            <p className="section-kicker">Marketplace</p>
            <h2 className="text-xl font-semibold text-ink">{editingId ? "Modifica promozione" : "Nuova promozione prezzi"}</h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              I prezzi normali restano invariati. La promozione viene applicata soltanto mentre è attiva.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold text-ink lg:col-span-2">
            Nome promozione
            <input
              className="min-h-12 rounded-lg border border-slate-200 px-4 outline-none focus:border-green"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <DateTimeField
            label="Inizio programmato"
            value={draft.startsAt}
            onChange={(startsAt) => setDraft((current) => ({ ...current, startsAt }))}
          />
          <DateTimeField
            label="Fine programmata"
            value={draft.endsAt}
            onChange={(endsAt) => setDraft((current) => ({ ...current, endsAt }))}
          />
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <ModeToggle
            checked={draft.applyExclusive}
            label="Acquisti in esclusiva"
            onChange={(applyExclusive) => setDraft((current) => ({ ...current, applyExclusive }))}
          />
          <ModeToggle
            checked={draft.applyShared}
            label="Acquisti condivisi"
            onChange={(applyShared) => setDraft((current) => ({ ...current, applyShared }))}
          />
        </div>

        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-ink">Fasce prezzo</h3>
              <p className="mt-1 text-xs leading-5 text-muted">La regola scatta solo quando il prezzo normale coincide esattamente.</p>
            </div>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setDraft((current) => ({
                ...current,
                rules: [...current.rules, createRule(current.applyExclusive ? "exclusive" : "shared", 5000, 3000)],
              }))}
            >
              <Plus size={16} /> Aggiungi fascia
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            {draft.rules.map((rule) => (
              <RuleEditor
                key={rule.id}
                rule={rule}
                onChange={(nextRule) => setDraft((current) => ({
                  ...current,
                  rules: current.rules.map((item) => item.id === rule.id ? nextRule : item),
                }))}
                onDelete={() => setDraft((current) => ({
                  ...current,
                  rules: current.rules.filter((item) => item.id !== rule.id),
                }))}
              />
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-5">
          <p className="text-sm font-bold text-blue-950">Anteprima impatto</p>
          <p className="mt-2 text-sm text-blue-900">
            <strong>{preview.leadCount}</strong> lead disponibili coinvolti, per <strong>{preview.priceMatches}</strong> prezzi applicabili.
          </p>
          {preview.samples.length ? (
            <p className="mt-2 text-xs leading-5 text-blue-800">
              Esempi: {preview.samples.join(" · ")}
            </p>
          ) : (
            <p className="mt-2 text-xs text-blue-800">Nessun lead attuale corrisponde alle fasce inserite.</p>
          )}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <button className="btn btn-secondary" disabled={saving || !storageReady} type="button" onClick={() => void createPromotion("draft")}>
            Salva bozza
          </button>
          <button className="btn btn-secondary" disabled={saving || !storageReady} type="button" onClick={() => void createPromotion("scheduled")}>
            <CalendarClock size={17} /> Programma
          </button>
          <button className="btn btn-primary" disabled={saving || !storageReady} type="button" onClick={() => void createPromotion("active")}>
            <Play size={17} /> Attiva ora
          </button>
        </div>
        {editingId ? (
          <button className="mt-3 text-sm font-semibold text-muted underline" type="button" onClick={() => { setEditingId(null); setDraft(initialDraft()); }}>
            Annulla modifica
          </button>
        ) : null}
      </section>

      <section className="card p-5 sm:p-6">
        <p className="section-kicker">Storico</p>
        <h2 className="mt-2 text-xl font-semibold text-ink">Promozioni Marketplace</h2>
        <div className="mt-5 grid gap-4">
          {promotions.length ? promotions.map((promotion) => (
            <PromotionCard
              key={promotion.id}
              promotion={promotion}
              disabled={saving}
              onAction={runAction}
              onDuplicate={duplicate}
              onEdit={edit}
            />
          )) : <p className="rounded-xl bg-slate-50 p-6 text-sm text-muted">Nessuna promozione creata.</p>}
        </div>
      </section>
    </div>
  );
}

function RuleEditor({ rule, onChange, onDelete }: {
  rule: MarketplacePromotionRule;
  onChange: (rule: MarketplacePromotionRule) => void;
  onDelete: () => void;
}) {
  return (
    <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[180px_1fr_1fr_44px] sm:items-end">
      <label className="grid gap-2 text-xs font-bold uppercase text-muted">
        Modalità
        <select className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm normal-case text-ink" value={rule.mode} onChange={(event) => onChange({ ...rule, mode: event.target.value as PromotionPurchaseMode })}>
          <option value="exclusive">Esclusiva</option>
          <option value="shared">Condivisa</option>
        </select>
      </label>
      <EuroInput label="Prezzo normale" value={rule.basePriceCents} onChange={(basePriceCents) => onChange({ ...rule, basePriceCents })} />
      <EuroInput label="Prezzo promozionale" value={rule.promotionalPriceCents} onChange={(promotionalPriceCents) => onChange({ ...rule, promotionalPriceCents })} />
      <button className="flex size-11 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600" type="button" title="Elimina fascia" onClick={onDelete}><Trash2 size={17} /></button>
    </div>
  );
}

function PromotionCard({ promotion, disabled, onAction, onDuplicate, onEdit }: {
  promotion: PromotionView;
  disabled: boolean;
  onAction: (promotion: PromotionView, action: "activate" | "end" | "cancel") => void;
  onDuplicate: (promotion: PromotionView) => void;
  onEdit: (promotion: PromotionView) => void;
}) {
  const active = promotion.effectiveStatus === "active";
  const actionable = !["ended", "cancelled"].includes(promotion.effectiveStatus);
  return (
    <article className={`rounded-xl border p-4 sm:p-5 ${active ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-ink">{promotion.name}</h3>
            <StatusBadge status={promotion.effectiveStatus} />
          </div>
          <p className="mt-2 text-xs leading-5 text-muted">
            {promotion.starts_at ? `Inizio ${formatDateTime(promotion.starts_at)}` : "Attivazione manuale"}
            {promotion.ends_at ? ` · Fine ${formatDateTime(promotion.ends_at)}` : " · Nessuna scadenza"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {promotion.rules.map((rule) => (
              <span key={rule.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-ink">
                {rule.mode === "exclusive" ? "Esclusiva" : "Condivisa"}: {formatCurrencyCents(rule.basePriceCents)} → {formatCurrencyCents(rule.promotionalPriceCents)}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {["draft", "scheduled"].includes(promotion.status) && promotion.effectiveStatus !== "active" ? <button className="btn btn-secondary" disabled={disabled} type="button" onClick={() => onEdit(promotion)}><Pencil size={16} /> Modifica</button> : null}
          <button className="btn btn-secondary" disabled={disabled} type="button" onClick={() => onDuplicate(promotion)}><Copy size={16} /> Duplica</button>
          {actionable && !active ? <button className="btn btn-primary" disabled={disabled} type="button" onClick={() => onAction(promotion, "activate")}><Play size={16} /> Attiva ora</button> : null}
          {active ? <button className="btn btn-secondary" disabled={disabled} type="button" onClick={() => onAction(promotion, "end")}><Square size={16} /> Termina ora</button> : null}
          {promotion.effectiveStatus === "scheduled" ? <button className="btn btn-secondary text-red-600" disabled={disabled} type="button" onClick={() => onAction(promotion, "cancel")}><XCircle size={16} /> Annulla</button> : null}
        </div>
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: MarketplacePromotionStatus }) {
  const labels: Record<MarketplacePromotionStatus, string> = { draft: "Bozza", scheduled: "Programmata", active: "Attiva", ended: "Terminata", cancelled: "Annullata" };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status === "active" ? "bg-emerald-600 text-white" : status === "scheduled" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700"}`}>{labels[status]}</span>;
}

function ModeToggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-ink"><input className="size-5 accent-green" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function DateTimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid gap-2 text-sm font-semibold text-ink">{label}<input className="min-h-12 rounded-lg border border-slate-200 px-4 outline-none focus:border-green" type="datetime-local" value={value} onChange={(event) => onChange(event.target.value)} /><span className="text-xs font-normal text-muted">Fuso orario del dispositivo, normalmente Europe/Rome.</span></label>;
}

function EuroInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="grid gap-2 text-xs font-bold uppercase text-muted">{label}<div className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-3"><span className="mr-2 text-sm">€</span><input className="min-w-0 flex-1 bg-transparent text-sm normal-case text-ink outline-none" inputMode="decimal" value={(value / 100).toFixed(2).replace(".", ",")} onChange={(event) => onChange(parseEuroCents(event.target.value))} /></div></label>;
}

function Notice({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  return <div className={`rounded-xl border p-4 text-sm font-semibold ${tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{children}</div>;
}

function createRule(mode: PromotionPurchaseMode, basePriceCents: number, promotionalPriceCents: number): MarketplacePromotionRule {
  return { id: crypto.randomUUID(), mode, basePriceCents, promotionalPriceCents };
}

function parseEuroCents(value: string) {
  const parsed = Number.parseFloat(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
}

function toIsoOrNull(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Rome" }).format(new Date(value));
}

function calculatePreview(draft: Draft, leads: AvailableLead[]) {
  const matchingLeadIds = new Set<string>();
  let priceMatches = 0;
  const samples: string[] = [];

  for (const lead of leads) {
    for (const rule of draft.rules) {
      if (rule.mode === "shared" && !draft.applyShared) continue;
      if (rule.mode === "exclusive" && !draft.applyExclusive) continue;
      const base = rule.mode === "shared" ? lead.shared_price_cents : lead.exclusive_price_cents;
      if (base !== rule.basePriceCents) continue;
      matchingLeadIds.add(lead.id);
      priceMatches += 1;
      if (samples.length < 3) samples.push(`${lead.title}: ${formatCurrencyCents(base)} → ${formatCurrencyCents(rule.promotionalPriceCents)}`);
    }
  }

  return { leadCount: matchingLeadIds.size, priceMatches, samples };
}

function confirmMessage(targetStatus: "draft" | "scheduled" | "active", leadCount: number) {
  if (targetStatus === "active") return `Attivare ora la promozione su ${leadCount} lead disponibili?`;
  if (targetStatus === "scheduled") return `Programmare la promozione per ${leadCount} lead attualmente corrispondenti? Anche i nuovi lead compatibili saranno inclusi.`;
  return "Salvare questa promozione come bozza?";
}
