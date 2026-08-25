"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeEuro,
  Calculator,
  FileCheck2,
  Home,
  Save,
  UserRound,
  X,
} from "lucide-react";
import { AdminLeadFinancialEstimateModal } from "@/components/admin-lead-financial-estimate-modal";
import type { AdminLeadRecord } from "@/lib/admin/lead-records";
import { ITALY_GEO } from "@/lib/geo/italy-geo";
import {
  OWNER_CURRENT_STATUS_OPTIONS,
  OWNER_PROPERTY_TYPES,
  OWNER_REQUESTED_SERVICE_OPTIONS,
  OWNER_TIMING_OPTIONS,
} from "@/lib/owner-requests/options";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

type AdminLeadEditorModalProps = {
  record: AdminLeadRecord;
  approvalDraft?: {
    sharedPriceCents: number;
    exclusivePriceCents: number;
    sublettingAvailable: boolean;
  };
  onApprovalDraftChange?: (update: {
    sharedPriceCents: number;
    exclusivePriceCents: number;
    ownerVerified: boolean;
    sublettingAvailable: boolean;
    pricesCustomized: boolean;
  }) => void;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

type LeadEditDraft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  preciseAddress: string;
  region: string;
  province: string;
  city: string;
  propertyType: string;
  bedrooms: string;
  bathrooms: string;
  beds: string;
  areaSqm: string;
  currentStatus: string[];
  requestedServices: string[];
  timing: string;
  description: string;
  privacyConsent: boolean;
  dataSharingConsent: boolean;
  marketingConsent: boolean;
  qualificationNotes: string;
  ownerVerified: boolean;
  sublettingAvailable: boolean;
  leadTitle: string;
  sharedPrice: string;
  exclusivePrice: string;
};

export function AdminLeadEditorModal({
  record,
  approvalDraft,
  onApprovalDraftChange,
  onClose,
  onSaved,
}: AdminLeadEditorModalProps) {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [draft, setDraft] = useState<LeadEditDraft>(() =>
    buildDraft(record, approvalDraft),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [financialEstimateOpen, setFinancialEstimateOpen] = useState(false);
  const regions = useMemo(
    () => mergeOptions(ITALY_GEO.map((item) => item.region), draft.region),
    [draft.region],
  );
  const provinces = useMemo(() => {
    const region = ITALY_GEO.find((item) => item.region === draft.region);
    return mergeOptions(
      region?.provinces.map((item) => item.province) ?? [],
      draft.province,
    );
  }, [draft.province, draft.region]);
  const cities = useMemo(() => {
    const region = ITALY_GEO.find((item) => item.region === draft.region);
    const province = region?.provinces.find(
      (item) => item.province === draft.province,
    );
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
    () =>
      mergeOptions(
        [...OWNER_CURRENT_STATUS_OPTIONS],
        ...draft.currentStatus,
      ),
    [draft.currentStatus],
  );
  const requestedServiceOptions = useMemo(
    () =>
      mergeOptions(
        [...OWNER_REQUESTED_SERVICE_OPTIONS],
        ...draft.requestedServices,
      ),
    [draft.requestedServices],
  );

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  function update<K extends keyof LeadEditDraft>(
    key: K,
    value: LeadEditDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function selectRegion(value: string) {
    setDraft((current) => ({
      ...current,
      region: value,
      province: "",
      city: "",
    }));
  }

  function selectProvince(value: string) {
    setDraft((current) => ({
      ...current,
      province: value,
      city: "",
    }));
  }

  function toggleList(
    key: "currentStatus" | "requestedServices",
    value: string,
  ) {
    setDraft((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value],
    }));
  }

  async function save() {
    const sharedPriceCents = parseEuroCents(draft.sharedPrice);
    const exclusivePriceCents = parseEuroCents(draft.exclusivePrice);

    if (sharedPriceCents < 100 || exclusivePriceCents < 100) {
      setError("I prezzi del lead devono essere di almeno 1,00 €.");
      return;
    }

    if (
      record.lead &&
      hasMarketplaceChanges(record, draft) &&
      !window.confirm(
        "Confermi le modifiche al lead pubblicato? Titolo, badge e nuovi prezzi saranno aggiornati subito nel Marketplace. Gli acquisti già conclusi non cambieranno.",
      )
    ) {
      return;
    }

    setSaving(true);
    setError("");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      setError("Sessione admin non disponibile.");
      setSaving(false);
      return;
    }

    const response = await fetch(`/api/admin/leads/${record.ownerRequestId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contact: {
          firstName: draft.firstName,
          lastName: draft.lastName,
          email: draft.email,
          phone: draft.phone,
          preciseAddress: draft.preciseAddress,
        },
        property: {
          region: draft.region,
          province: draft.province,
          city: draft.city,
          propertyType: draft.propertyType,
          bedrooms: parseOptionalNumber(draft.bedrooms),
          bathrooms: parseOptionalNumber(draft.bathrooms),
          beds: parseOptionalNumber(draft.beds),
          areaSqm: parseOptionalNumber(draft.areaSqm),
          currentStatus: draft.currentStatus,
          requestedServices: draft.requestedServices,
          timing: draft.timing,
          description: draft.description,
        },
        consents: {
          privacy: draft.privacyConsent,
          dataSharing: draft.dataSharingConsent,
          marketing: draft.marketingConsent,
        },
        qualificationNotes: draft.qualificationNotes,
        marketplace: {
          ownerVerified: draft.ownerVerified,
          sublettingAvailable: draft.sublettingAvailable,
          ...(record.lead
            ? {
                title: draft.leadTitle,
                sharedPriceCents,
                exclusivePriceCents,
              }
            : {}),
        },
      }),
    });
    const payload = (await response.json()) as {
      error?: string;
      fields?: Array<{ field: string; message: string }>;
    };

    if (!response.ok) {
      setError(
        payload.fields?.[0]?.message ??
          payload.error ??
          "Non sono riuscito a salvare le informazioni.",
      );
      setSaving(false);
      return;
    }

    if (!record.lead) {
      onApprovalDraftChange?.({
        sharedPriceCents,
        exclusivePriceCents,
        ownerVerified: draft.ownerVerified,
        sublettingAvailable: draft.sublettingAvailable,
        pricesCustomized: true,
      });
    }

    await onSaved();
    setSaving(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end bg-slate-950/45 sm:items-center sm:justify-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-editor-title"
    >
      <div className="flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:max-w-5xl sm:rounded-lg">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="section-kicker">Gestione lead</p>
            <h2
              className="mt-1 text-xl font-semibold text-ink sm:text-2xl"
              id="lead-editor-title"
            >
              Modifica informazioni
            </h2>
            <p className="mt-1 text-sm text-muted">
              LH-{record.ownerRequestId.slice(0, 8).toUpperCase()}
            </p>
          </div>
          <button
            className="icon-button shrink-0"
            type="button"
            title="Chiudi"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid min-w-0 gap-7">
            <EditorSection icon={UserRound} title="Dati proprietario">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Nome"
                  value={draft.firstName}
                  onChange={(value) => update("firstName", value)}
                />
                <TextField
                  label="Cognome"
                  value={draft.lastName}
                  onChange={(value) => update("lastName", value)}
                />
                <TextField
                  label="Email"
                  type="email"
                  value={draft.email}
                  onChange={(value) => update("email", value)}
                />
                <TextField
                  label="Telefono"
                  type="tel"
                  value={draft.phone}
                  onChange={(value) => update("phone", value)}
                />
              </div>
            </EditorSection>

            <EditorSection icon={Home} title="Immobile">
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Regione"
                  value={draft.region}
                  options={regions}
                  onChange={selectRegion}
                />
                <SelectField
                  label="Provincia"
                  value={draft.province}
                  options={provinces}
                  onChange={selectProvince}
                />
                <SelectField
                  label="Città"
                  value={draft.city}
                  options={cities}
                  onChange={(value) => update("city", value)}
                />
                <TextField
                  label="Indirizzo"
                  value={draft.preciseAddress}
                  onChange={(value) => update("preciseAddress", value)}
                />
                <SelectField
                  label="Tipologia immobile"
                  value={draft.propertyType}
                  options={propertyTypes}
                  onChange={(value) => update("propertyType", value)}
                />
                <SelectField
                  label="Tempistica"
                  value={draft.timing}
                  options={timingOptions}
                  onChange={(value) => update("timing", value)}
                />
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-4">
                <NumberField
                  label="Camere"
                  value={draft.bedrooms}
                  onChange={(value) => update("bedrooms", value)}
                />
                <NumberField
                  label="Bagni"
                  value={draft.bathrooms}
                  onChange={(value) => update("bathrooms", value)}
                />
                <NumberField
                  label="Posti letto"
                  value={draft.beds}
                  onChange={(value) => update("beds", value)}
                />
                <NumberField
                  label="Metratura"
                  value={draft.areaSqm}
                  onChange={(value) => update("areaSqm", value)}
                />
              </div>
              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <OptionSelector
                  label="Stato attuale"
                  options={currentStatusOptions}
                  selected={draft.currentStatus}
                  onToggle={(value) => toggleList("currentStatus", value)}
                />
                <OptionSelector
                  label="Servizi richiesti"
                  options={requestedServiceOptions}
                  selected={draft.requestedServices}
                  onToggle={(value) => toggleList("requestedServices", value)}
                />
              </div>
              <label className="mt-5 grid gap-2 text-sm font-semibold text-ink">
                Descrizione proprietario
                <textarea
                  className="min-h-28 resize-y rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-green"
                  maxLength={700}
                  value={draft.description}
                  onChange={(event) => update("description", event.target.value)}
                />
              </label>
            </EditorSection>

            <EditorSection icon={BadgeEuro} title="Impostazioni Marketplace">
              {record.sublettingFeatureAvailable ? (
                <label className="mb-4 flex items-start gap-3 rounded-lg border border-violet-200 bg-violet-50 p-4">
                  <input
                    className="mt-0.5 size-4 accent-violet-700"
                    type="checkbox"
                    checked={draft.sublettingAvailable}
                    onChange={(event) =>
                      update("sublettingAvailable", event.target.checked)
                    }
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-violet-900">
                      Disponibile alla sublocazione
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-violet-800">
                      Seleziona quando il proprietario dichiara la disponibilità a
                      valutare un accordo di sublocazione.
                    </span>
                  </span>
                </label>
              ) : null}

              <label className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
                <input
                  className="mt-0.5 size-4 accent-blue-600"
                  type="checkbox"
                  checked={draft.ownerVerified}
                  onChange={(event) =>
                    update("ownerVerified", event.target.checked)
                  }
                />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-blue-900">
                    Proprietario verificato
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-blue-800">
                    Il badge sarà mostrato solo se la verifica telefonica è stata
                    completata.
                  </span>
                </span>
              </label>

              <div className="mt-5 grid gap-4">
                {record.lead ? (
                  <TextField
                    label="Titolo del lead"
                    value={draft.leadTitle}
                    onChange={(value) => update("leadTitle", value)}
                  />
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <EuroEditField
                    label="Prezzo condiviso"
                    value={draft.sharedPrice}
                    onChange={(value) => update("sharedPrice", value)}
                  />
                  <EuroEditField
                    label="Prezzo esclusivo"
                    value={draft.exclusivePrice}
                    onChange={(value) => update("exclusivePrice", value)}
                  />
                </div>
                <p className="text-xs leading-5 text-muted">
                  {record.lead
                    ? "Le modifiche si applicano ai prossimi acquisti. Importi e transazioni già registrati restano invariati."
                    : "Questi importi saranno utilizzati quando il lead verrà approvato e pubblicato nel Marketplace."}
                </p>
                {record.lead ? (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-bold text-blue-950">
                          Stima finanziaria Marketplace
                        </p>
                        <p className="mt-1 text-xs leading-5 text-blue-800">
                          Prepara la previsione interna del lead. Non sarà visibile ai Property Manager finché non verrà attivata nella prossima fase.
                        </p>
                      </div>
                      <button
                        className="btn btn-secondary shrink-0 border-blue-200 bg-white text-blue-900 hover:bg-blue-100"
                        type="button"
                        onClick={() => setFinancialEstimateOpen(true)}
                      >
                        <Calculator size={17} /> Gestisci stima
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </EditorSection>

            <EditorSection icon={FileCheck2} title="Consensi e note interne">
              <div className="grid gap-3">
                <ConsentField
                  checked={draft.privacyConsent}
                  label="Consenso privacy acquisito"
                  onChange={(checked) => update("privacyConsent", checked)}
                />
                <ConsentField
                  checked={draft.dataSharingConsent}
                  label="Consenso alla condivisione dei dati acquisito"
                  onChange={(checked) => update("dataSharingConsent", checked)}
                />
                <ConsentField
                  checked={draft.marketingConsent}
                  label="Consenso marketing acquisito"
                  onChange={(checked) => update("marketingConsent", checked)}
                />
              </div>
              <label className="mt-5 grid gap-2 text-sm font-semibold text-ink">
                Note interne
                <textarea
                  className="min-h-24 resize-y rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-green"
                  maxLength={1200}
                  value={draft.qualificationNotes}
                  onChange={(event) =>
                    update("qualificationNotes", event.target.value)
                  }
                />
              </label>
            </EditorSection>
          </div>

          {error ? (
            <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button
            className="btn btn-secondary"
            type="button"
            disabled={saving}
            onClick={onClose}
          >
            Annulla
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={saving}
            onClick={() => void save()}
          >
            <Save size={17} />
            {saving ? "Salvataggio..." : "Salva informazioni"}
          </button>
        </footer>
      </div>
      {financialEstimateOpen && record.lead ? (
        <AdminLeadFinancialEstimateModal
          ownerRequestId={record.ownerRequestId}
          leadTitle={draft.leadTitle || record.lead.title}
          onClose={() => setFinancialEstimateOpen(false)}
          onSaved={onSaved}
        />
      ) : null}
    </div>
  );
}

function EditorSection({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Home;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 border-b border-slate-200 pb-7 last:border-0 last:pb-0">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-ink">
        <span className="rounded-lg bg-mint p-2 text-green">
          <Icon size={18} />
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function TextField({
  label,
  value,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-ink">
      {label}
      <input
        className="min-h-11 min-w-0 rounded-lg border border-slate-200 px-3 outline-none focus:border-green"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-ink">
      {label}
      <input
        className="min-h-11 min-w-0 rounded-lg border border-slate-200 px-3 outline-none focus:border-green"
        min={0}
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-ink">
      {label}
      <select
        className="min-h-11 min-w-0 rounded-lg border border-slate-200 bg-white px-3 outline-none focus:border-green"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Non indicato</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function OptionSelector({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-semibold text-ink">{label}</legend>
      <div className="mt-2 grid gap-2">
        {options.map((option) => (
          <label
            className="flex min-w-0 items-start gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-ink"
            key={option}
          >
            <input
              className="mt-0.5 size-4 accent-green"
              type="checkbox"
              checked={selected.includes(option)}
              onChange={() => onToggle(option)}
            />
            <span className="min-w-0 break-words">{option}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ConsentField({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm font-semibold text-ink">
      <input
        className="size-4 accent-green"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function buildDraft(
  record: AdminLeadRecord,
  approvalDraft?: {
    sharedPriceCents: number;
    exclusivePriceCents: number;
  },
): LeadEditDraft {
  return {
    firstName: record.contact?.firstName ?? "",
    lastName: record.contact?.lastName ?? "",
    email: record.contact?.email ?? "",
    phone: record.contact?.phone ?? "",
    preciseAddress: record.contact?.preciseAddress ?? "",
    region: record.property?.region ?? "",
    province: record.property?.province ?? "",
    city: record.property?.city ?? "",
    propertyType: record.property?.propertyType ?? "",
    bedrooms: numberToInput(record.property?.bedrooms),
    bathrooms: numberToInput(record.property?.bathrooms),
    beds: numberToInput(record.property?.beds),
    areaSqm: numberToInput(record.property?.areaSqm),
    currentStatus: record.property?.currentStatus ?? [],
    requestedServices: record.property?.requestedServices ?? [],
    timing: record.property?.timing ?? "",
    description: record.property?.description ?? "",
    privacyConsent: record.consents.privacy,
    dataSharingConsent: record.consents.dataSharing,
    marketingConsent: record.consents.marketing,
    qualificationNotes: record.qualificationNotes ?? "",
    ownerVerified: record.ownerVerified,
    sublettingAvailable: record.sublettingAvailable,
    leadTitle: record.lead?.title ?? "",
    sharedPrice: centsToEuroInput(
      record.lead?.sharedPriceCents ??
        approvalDraft?.sharedPriceCents ??
        record.pricing.sharedPriceCents,
    ),
    exclusivePrice: centsToEuroInput(
      record.lead?.exclusivePriceCents ??
        approvalDraft?.exclusivePriceCents ??
        record.pricing.exclusivePriceCents,
    ),
  };
}

function EuroEditField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-ink">
      {label}
      <div className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-3 focus-within:border-green">
        <span className="mr-2 text-sm font-bold text-muted">EUR</span>
        <input
          className="min-w-0 flex-1 border-0 bg-transparent outline-none"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </label>
  );
}

function hasMarketplaceChanges(record: AdminLeadRecord, draft: LeadEditDraft) {
  if (!record.lead) {
    return (
      draft.ownerVerified !== record.ownerVerified ||
      draft.sublettingAvailable !== record.sublettingAvailable
    );
  }

  return (
    draft.ownerVerified !== record.ownerVerified ||
    draft.sublettingAvailable !== record.sublettingAvailable ||
    draft.leadTitle.trim() !== record.lead.title.trim() ||
    parseEuroCents(draft.sharedPrice) !== record.lead.sharedPriceCents ||
    parseEuroCents(draft.exclusivePrice) !== record.lead.exclusivePriceCents
  );
}

function centsToEuroInput(value: number) {
  return (value / 100).toFixed(2).replace(".", ",");
}

function parseEuroCents(value: string) {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function numberToInput(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mergeOptions(base: readonly string[], ...values: string[]) {
  return Array.from(new Set([...base, ...values.filter(Boolean)]));
}
