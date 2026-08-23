"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeEuro,
  CircleAlert,
  Clock3,
  CreditCard,
  ExternalLink,
  Gift,
  Image as ImageIcon,
  PackageOpen,
  Save,
  Settings2,
  Sparkles,
  Users,
  Video,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { AdminAddonAccessManager } from "@/components/admin-addon-access-manager";
import type {
  AddonCancellationMode,
  AddonProductAdmin,
  AddonProductStatus,
  AddonSubscriptionSummary,
} from "@/lib/addons/types";

type AddonsResponse = {
  product: AddonProductAdmin;
  summary: AddonSubscriptionSummary;
  error?: string;
};

type AddonDraft = Omit<
  AddonProductAdmin,
  "id" | "slug" | "listPriceCents" | "salePriceCents" | "updatedAt"
> & {
  listPrice: string;
  salePrice: string;
  featuresText: string;
};

const emptySummary: AddonSubscriptionSummary = {
  trialing: 0,
  active: 0,
  paymentIssues: 0,
  manual: 0,
};

export function AdminAddonsConsole() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [product, setProduct] = useState<AddonProductAdmin | null>(null);
  const [draft, setDraft] = useState<AddonDraft | null>(null);
  const [summary, setSummary] = useState(emptySummary);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadProduct = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError("");

    const token = await getToken();
    if (!token) {
      setError("Sessione Super Admin non trovata.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/admin/addons", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json()) as AddonsResponse;

    if (!response.ok) {
      setError(payload.error ?? "Non riesco a caricare gli Addons.");
      setLoading(false);
      return;
    }

    setProduct(payload.product);
    setDraft(toDraft(payload.product));
    setSummary(payload.summary);
    setLoading(false);
  }, [getToken]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadProduct(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadProduct]);

  function updateDraft(update: Partial<AddonDraft>) {
    setDraft((current) => (current ? { ...current, ...update } : current));
  }

  async function saveProduct() {
    if (!draft) return;

    const listPriceCents = parseEuroInput(draft.listPrice);
    const salePriceCents = parseEuroInput(draft.salePrice);

    if (draft.listPrice.trim() && listPriceCents === null) {
      setError("Inserisci un prezzo di listino valido.");
      return;
    }

    if (draft.salePrice.trim() && salePriceCents === null) {
      setError("Inserisci un prezzo di vendita valido.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const token = await getToken();
    if (!token) {
      setError("Sessione Super Admin non trovata.");
      setSaving(false);
      return;
    }

    const features = draft.featuresText
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    const response = await fetch("/api/admin/addons", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: draft.name,
        shortDescription: draft.shortDescription,
        description: draft.description,
        status: draft.status,
        isMenuVisible: draft.isMenuVisible,
        checkoutEnabled: draft.checkoutEnabled,
        trialDays: draft.trialDays,
        listPriceCents,
        salePriceCents,
        gracePeriodDays: draft.gracePeriodDays,
        cancellationMode: draft.cancellationMode,
        coverImageUrl: draft.coverImageUrl,
        videoUrl: draft.videoUrl,
        features,
        termsUrl: draft.termsUrl,
      }),
    });
    const payload = (await response.json()) as AddonsResponse;

    if (!response.ok) {
      setError(payload.error ?? "Salvataggio Addon non riuscito.");
      setSaving(false);
      return;
    }

    setProduct(payload.product);
    setDraft(toDraft(payload.product));
    setSummary(payload.summary);
    setSuccess("Configurazione del Modulo Marketing aggiornata.");
    setSaving(false);
  }

  if (loading) {
    return <section className="card p-8 text-center text-muted">Carico Addons...</section>;
  }

  if (!draft || !product) {
    return (
      <section className="card border-red-200 p-6 text-sm font-semibold text-red-700">
        {error || "Configurazione Addons non disponibile."}
      </section>
    );
  }

  const stripeReady = Boolean(draft.stripeProductId && draft.stripePriceId);

  return (
    <div className="grid min-w-0 gap-6">
      <section className="card p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
              <PackageOpen size={24} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="break-words text-xl font-semibold text-ink sm:text-2xl">
                  {product.name}
                </h2>
                <StatusBadge status={draft.status} />
              </div>
              <p className="mt-2 text-sm text-muted">Codice prodotto: marketing</p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-3 lg:w-auto lg:flex-row">
            <a
              className="btn btn-secondary w-full lg:w-auto"
              href="/app/marketing?preview=offer"
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink size={17} />
              Apri pagina di vendita
            </a>
            <button
              className="btn btn-primary w-full lg:w-auto"
              type="button"
              disabled={saving}
              onClick={() => void saveProduct()}
            >
              <Save size={17} />
              {saving ? "Salvataggio..." : "Salva configurazione"}
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
            {success}
          </div>
        ) : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Gift} label="Trial attivi" value={summary.trialing} tone="blue" />
        <MetricCard icon={Users} label="Abbonamenti attivi" value={summary.active} tone="green" />
        <MetricCard icon={CircleAlert} label="Problemi pagamento" value={summary.paymentIssues} tone="red" />
        <MetricCard icon={Sparkles} label="Accessi manuali" value={summary.manual} tone="amber" />
      </section>

      <AdminAddonAccessManager onChanged={() => loadProduct(false)} />

      <section className="card p-5 sm:p-6">
        <SectionTitle icon={Settings2} title="Stato e visibilità" />
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <Field label="Nome prodotto">
            <input
              className="input"
              value={draft.name}
              maxLength={120}
              onChange={(event) => updateDraft({ name: event.target.value })}
            />
          </Field>
          <Field label="Stato">
            <select
              className="input"
              value={draft.status}
              onChange={(event) =>
                updateDraft({ status: event.target.value as AddonProductStatus })
              }
            >
              <option value="draft">Bozza</option>
              <option value="active">Attivo</option>
              <option value="inactive">Disattivato</option>
            </select>
          </Field>
          <ToggleField
            checked={draft.isMenuVisible}
            label="Visibile nel menu PM"
            onChange={(checked) => updateDraft({ isMenuVisible: checked })}
          />
          <ToggleField
            checked={draft.checkoutEnabled}
            disabled={draft.status !== "active" || !draft.salePrice.trim()}
            label="Checkout abilitato"
            onChange={(checked) => updateDraft({ checkoutEnabled: checked })}
          />
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <SectionTitle icon={BadgeEuro} title="Offerta commerciale" />
        <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Prezzo di listino">
            <MoneyInput
              value={draft.listPrice}
              onChange={(value) => updateDraft({ listPrice: value })}
            />
          </Field>
          <Field label="Prezzo mensile di vendita">
            <MoneyInput
              value={draft.salePrice}
              onChange={(value) => updateDraft({ salePrice: value })}
            />
          </Field>
          <Field label="Giorni di prova gratuita">
            <input
              className="input"
              type="number"
              min={0}
              max={365}
              value={draft.trialDays}
              onChange={(event) =>
                updateDraft({ trialDays: Number(event.target.value) || 0 })
              }
            />
          </Field>
          <Field label="Tolleranza pagamento fallito">
            <div className="relative">
              <input
                className="input pr-16"
                type="number"
                min={0}
                max={30}
                value={draft.gracePeriodDays}
                onChange={(event) =>
                  updateDraft({ gracePeriodDays: Number(event.target.value) || 0 })
                }
              />
              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-semibold text-muted">
                giorni
              </span>
            </div>
          </Field>
          <Field label="Periodicità">
            <div className="input flex items-center gap-2 bg-slate-50 text-muted">
              <Clock3 size={17} /> Mensile
            </div>
          </Field>
          <Field label="Valuta">
            <div className="input flex items-center gap-2 bg-slate-50 text-muted">
              <BadgeEuro size={17} /> EUR
            </div>
          </Field>
          <Field label="Cancellazione">
            <select
              className="input"
              value={draft.cancellationMode}
              onChange={(event) =>
                updateDraft({
                  cancellationMode: event.target.value as AddonCancellationMode,
                })
              }
            >
              <option value="period_end">A fine periodo</option>
              <option value="immediate">Immediata</option>
            </select>
          </Field>
          <Field label="Termini del servizio">
            <input
              className="input"
              value={draft.termsUrl}
              onChange={(event) => updateDraft({ termsUrl: event.target.value })}
            />
          </Field>
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <SectionTitle icon={CreditCard} title="Collegamento Stripe" />
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <Field label="Stripe Product ID">
            <input
              className="input bg-slate-50 font-mono text-sm text-muted"
              placeholder="prod_..."
              readOnly
              value={draft.stripeProductId}
            />
          </Field>
          <Field label="Stripe Price ID">
            <input
              className="input bg-slate-50 font-mono text-sm text-muted"
              placeholder="price_..."
              readOnly
              value={draft.stripePriceId}
            />
          </Field>
        </div>
        <div
          className={`mt-5 flex items-center gap-3 rounded-lg border p-4 text-sm font-semibold ${
            stripeReady
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-slate-200 bg-slate-50 text-muted"
          }`}
        >
          <CreditCard size={18} className="shrink-0" />
          {stripeReady
            ? "Catalogo Stripe sincronizzato automaticamente"
            : "Salva la configurazione per creare prodotto e prezzo su Stripe"}
        </div>
        <p className="mt-3 text-sm leading-6 text-muted">
          Se modifichi il prezzo di vendita, Lead Host crea un nuovo prezzo ricorrente su Stripe e archivia quello precedente. Gli abbonamenti giÃ  attivi non vengono modificati.
        </p>
      </section>

      <section className="card p-5 sm:p-6">
        <SectionTitle icon={Sparkles} title="Presentazione del modulo" />
        <div className="mt-5 grid gap-5">
          <Field label="Descrizione breve">
            <input
              className="input"
              maxLength={300}
              value={draft.shortDescription}
              onChange={(event) => updateDraft({ shortDescription: event.target.value })}
            />
          </Field>
          <Field label="Descrizione completa">
            <textarea
              className="input min-h-32 resize-y py-3"
              maxLength={5000}
              value={draft.description}
              onChange={(event) => updateDraft({ description: event.target.value })}
            />
          </Field>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Immagine di copertina">
              <div className="relative">
                <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={17} />
                <input
                  className="input pl-10"
                  placeholder="https://..."
                  value={draft.coverImageUrl}
                  onChange={(event) => updateDraft({ coverImageUrl: event.target.value })}
                />
              </div>
            </Field>
            <Field label="Video dimostrativo">
              <div className="relative">
                <Video className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={17} />
                <input
                  className="input pl-10"
                  placeholder="https://..."
                  value={draft.videoUrl}
                  onChange={(event) => updateDraft({ videoUrl: event.target.value })}
                />
              </div>
            </Field>
          </div>
          <Field label="Funzionalità incluse">
            <textarea
              className="input min-h-36 resize-y py-3"
              placeholder={"CRM con pipeline personalizzabile\nRendita Stimata con PDF personalizzato"}
              value={draft.featuresText}
              onChange={(event) => updateDraft({ featuresText: event.target.value })}
            />
          </Field>
        </div>
      </section>
    </div>
  );
}

function toDraft(product: AddonProductAdmin): AddonDraft {
  return {
    name: product.name,
    shortDescription: product.shortDescription,
    description: product.description,
    status: product.status,
    isMenuVisible: product.isMenuVisible,
    checkoutEnabled: product.checkoutEnabled,
    trialDays: product.trialDays,
    listPrice: formatEuroInput(product.listPriceCents),
    salePrice: formatEuroInput(product.salePriceCents),
    currency: product.currency,
    billingInterval: product.billingInterval,
    billingIntervalCount: product.billingIntervalCount,
    gracePeriodDays: product.gracePeriodDays,
    cancellationMode: product.cancellationMode,
    stripeProductId: product.stripeProductId,
    stripePriceId: product.stripePriceId,
    coverImageUrl: product.coverImageUrl,
    videoUrl: product.videoUrl,
    features: product.features,
    featuresText: product.features.join("\n"),
    termsUrl: product.termsUrl,
  };
}

function formatEuroInput(cents: number | null) {
  if (cents === null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

function parseEuroInput(value: string) {
  const normalized = value.trim().replace(/\s/g, "").replace(/€/g, "");
  if (!normalized) return null;

  const decimalValue = normalized.includes(",")
    ? normalized.replace(/\./g, "").replace(",", ".")
    : normalized;
  const amount = Number(decimalValue);

  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid min-w-0 gap-2 text-sm font-semibold text-ink">
      <span>{label}</span>
      {children}
    </label>
  );
}

function MoneyInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm font-semibold text-muted">
        EUR
      </span>
      <input
        className="input pl-14"
        inputMode="decimal"
        placeholder="0,00"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function ToggleField({
  checked,
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`flex min-h-14 items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-ink ${
        disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer"
      }`}
    >
      <span>{label}</span>
      <input
        className="peer sr-only"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="relative h-6 w-11 shrink-0 rounded-full bg-slate-300 transition peer-checked:bg-emerald-600 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500 peer-focus-visible:ring-offset-2 after:absolute after:left-1 after:top-1 after:size-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
    </label>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: typeof Settings2; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
        <Icon size={20} />
      </span>
      <h2 className="text-lg font-semibold text-ink sm:text-xl">{title}</h2>
    </div>
  );
}

function StatusBadge({ status }: { status: AddonProductStatus }) {
  const labels = { draft: "Bozza", active: "Attivo", inactive: "Disattivato" };
  const styles = {
    draft: "bg-amber-50 text-amber-700",
    active: "bg-emerald-50 text-emerald-700",
    inactive: "bg-slate-100 text-slate-600",
  };

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Gift;
  label: string;
  value: number;
  tone: "blue" | "green" | "red" | "amber";
}) {
  const styles = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-700",
  };

  return (
    <article className="card flex min-w-0 items-center justify-between gap-4 p-5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-muted">{label}</p>
        <p className="mt-2 text-3xl font-semibold text-ink">{value}</p>
      </div>
      <span className={`grid size-11 shrink-0 place-items-center rounded-lg ${styles[tone]}`}>
        <Icon size={21} />
      </span>
    </article>
  );
}
