"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Calculator,
  LoaderCircle,
  MapPin,
  Save,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import {
  MarketplaceFinancialEstimatePreviewModal,
  type MarketplaceFinancialEstimatePreviewData,
} from "@/components/marketplace-financial-estimate-preview-modal";
import {
  calculateRevenueEstimate,
  getMarketplaceFinancialSummary,
} from "@/lib/financial/revenue-calculation";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

type EstimateForm = {
  adrPerNight: number;
  occupancyRate: number;
  daysAvailable: number;
  pmFeeRate: number;
  airbnbMixRate: number;
  bookingMixRate: number;
  directMixRate: number;
  airbnbCommissionRate: number;
  bookingCommissionRate: number;
  directCommissionRate: number;
  otaVatRate: number;
  pmVatRate: number;
  taxRate: number;
  otaCostLabel: string;
  managementCostLabel: string;
  taxCostLabel: string;
  reportTitle: string;
  brandName: string;
  headerText: string | null;
  contactDetails: string | null;
  logoPath: string | null;
  disclaimer: string;
  isVisible: boolean;
};

type ApiEstimate = {
  adr_per_night: number;
  occupancy_rate: number;
  days_available: number;
  pm_fee_rate: number;
  airbnb_mix_rate: number;
  booking_mix_rate: number;
  direct_mix_rate: number;
  airbnb_commission_rate: number;
  booking_commission_rate: number;
  direct_commission_rate: number;
  ota_vat_rate: number;
  pm_vat_rate: number;
  tax_rate: number;
  ota_cost_label: string;
  management_cost_label: string;
  tax_cost_label: string;
  report_title: string;
  brand_name: string;
  header_text: string | null;
  contact_details: string | null;
  logo_path: string | null;
  disclaimer: string;
  is_visible: boolean;
};

type ApiTemplate = Omit<ApiEstimate, "adr_per_night" | "occupancy_rate" | "is_visible">;

type BnbcalcInput = {
  fullAddress: string;
  bedrooms: number | null;
  bathrooms: number | null;
  accommodates: number | null;
};

type BnbcalcResult = {
  runId: string;
  adrEur: number;
  occupancyPercentage: number;
  sourceCurrency: string;
  convertedFromUsd: boolean;
  conversionRate: number;
  exchangeRateDate: string | null;
  reportUrl: string | null;
};

export function AdminLeadFinancialEstimateModal({
  ownerRequestId,
  leadTitle,
  location,
  onClose,
  onSaved,
}: {
  ownerRequestId: string;
  leadTitle: string;
  location: string | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [form, setForm] = useState<EstimateForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [analysisError, setAnalysisError] = useState("");
  const [bnbcalcConfigured, setBnbcalcConfigured] = useState(true);
  const [bnbcalcInput, setBnbcalcInput] = useState<BnbcalcInput | null>(null);
  const [lastAnalysis, setLastAnalysis] = useState<BnbcalcResult | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) {
        if (!cancelled) {
          setError("Sessione admin non disponibile.");
          setLoading(false);
        }
        return;
      }
      const headers = { Authorization: `Bearer ${data.session.access_token}` };
      const [response, bnbcalcResponse] = await Promise.all([
        fetch(`/api/admin/leads/${ownerRequestId}/financial-estimate`, { headers }),
        fetch(
          `/api/admin/leads/${ownerRequestId}/financial-estimate/bnbcalc`,
          { headers },
        ),
      ]);
      const payload = (await response.json()) as {
        error?: string;
        estimate?: ApiEstimate | null;
        template?: ApiTemplate;
        logoUrl?: string | null;
      };
      const bnbcalcPayload = (await bnbcalcResponse.json()) as {
        error?: string;
        configured?: boolean;
        defaults?: BnbcalcInput;
        latestAnalysis?: BnbcalcResult | null;
      };
      if (cancelled) return;
      if (!response.ok || !payload.template) {
        setError(payload.error ?? "Non riesco a caricare la stima finanziaria.");
        setLoading(false);
        return;
      }
      const nextForm = toForm(payload.estimate ?? null, payload.template);
      if (
        !payload.estimate &&
        bnbcalcResponse.ok &&
        bnbcalcPayload.latestAnalysis
      ) {
        nextForm.adrPerNight = bnbcalcPayload.latestAnalysis.adrEur;
        nextForm.occupancyRate =
          bnbcalcPayload.latestAnalysis.occupancyPercentage / 100;
      }
      setForm(nextForm);
      setLogoUrl(payload.logoUrl ?? null);
      if (bnbcalcResponse.ok && bnbcalcPayload.defaults) {
        setBnbcalcInput(bnbcalcPayload.defaults);
        setBnbcalcConfigured(bnbcalcPayload.configured ?? false);
        setLastAnalysis(bnbcalcPayload.latestAnalysis ?? null);
      } else {
        setBnbcalcConfigured(false);
        setAnalysisError(
          bnbcalcPayload.error ?? "Non riesco a preparare l'analisi BNBCalc.",
        );
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ownerRequestId, supabase]);

  const result = form
    ? calculateRevenueEstimate({
        calculationMode: "adr_occupancy",
        adrPerNight: form.adrPerNight,
        occupancyRate: form.occupancyRate,
        daysAvailable: form.daysAvailable,
        pmFeeRate: form.pmFeeRate,
        airbnbMixRate: form.airbnbMixRate,
        bookingMixRate: form.bookingMixRate,
        directMixRate: form.directMixRate,
        airbnbCommissionRate: form.airbnbCommissionRate,
        bookingCommissionRate: form.bookingCommissionRate,
        directCommissionRate: form.directCommissionRate,
        otaVatRate: form.otaVatRate,
        pmVatRate: form.pmVatRate,
        taxRate: form.taxRate,
      })
    : null;
  const marketplaceSummary = result
    ? getMarketplaceFinancialSummary(result)
    : null;

  function update<K extends keyof EstimateForm>(key: K, value: EstimateForm[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function updateBnbcalc<K extends keyof BnbcalcInput>(
    key: K,
    value: BnbcalcInput[K],
  ) {
    setBnbcalcInput((current) =>
      current ? { ...current, [key]: value } : current,
    );
  }

  async function analyzeWithBnbcalc() {
    if (!bnbcalcInput || !form || analyzing) return;
    if (
      !bnbcalcInput.fullAddress.trim() ||
      bnbcalcInput.bedrooms === null ||
      bnbcalcInput.bathrooms === null ||
      bnbcalcInput.accommodates === null
    ) {
      setAnalysisError(
        "Compila indirizzo, camere, bagni e posti letto prima di avviare l'analisi.",
      );
      return;
    }
    if (
      !window.confirm(
        "Avviare l'analisi BNBCalc? Questa operazione utilizza un credito API.",
      )
    ) {
      return;
    }

    setAnalyzing(true);
    setAnalysisError("");
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) {
      setAnalysisError("Sessione admin non disponibile.");
      setAnalyzing(false);
      return;
    }

    try {
      const response = await fetch(
        `/api/admin/leads/${ownerRequestId}/financial-estimate/bnbcalc`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requestKey: crypto.randomUUID(),
            fullAddress: bnbcalcInput.fullAddress,
            bedrooms: bnbcalcInput.bedrooms,
            bathrooms: bnbcalcInput.bathrooms,
            accommodates: bnbcalcInput.accommodates,
          }),
        },
      );
      const payload = (await response.json()) as BnbcalcResult & { error?: string };
      if (!response.ok) {
        setAnalysisError(payload.error ?? "Analisi BNBCalc non riuscita.");
        return;
      }

      update("adrPerNight", payload.adrEur);
      update("occupancyRate", payload.occupancyPercentage / 100);
      setLastAnalysis(payload);
    } catch (analysisRequestError) {
      setAnalysisError(
        analysisRequestError instanceof Error
          ? analysisRequestError.message
          : "Analisi BNBCalc non riuscita.",
      );
    } finally {
      setAnalyzing(false);
    }
  }

  async function save() {
    if (!form) return;
    const mix = form.airbnbMixRate + form.bookingMixRate + form.directMixRate;
    if (Math.abs(mix - 1) > 0.0001) {
      setError("Il mix dei canali deve totalizzare il 100%.");
      return;
    }
    setSaving(true);
    setError("");
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) {
      setError("Sessione admin non disponibile.");
      setSaving(false);
      return;
    }
    const response = await fetch(
      `/api/admin/leads/${ownerRequestId}/financial-estimate`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      },
    );
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Non riesco a salvare la stima finanziaria.");
      setSaving(false);
      return;
    }
    await onSaved();
    setSaving(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end bg-slate-950/55 sm:items-center sm:justify-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="marketplace-financial-estimate-title"
    >
      <div className="flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:max-w-4xl sm:rounded-lg">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="section-kicker">Stima Marketplace</p>
            <h2
              className="mt-1 text-xl font-semibold text-ink sm:text-2xl"
              id="marketplace-financial-estimate-title"
            >
              Stima finanziaria
            </h2>
            <p className="mt-1 truncate text-sm text-muted">{leadTitle}</p>
          </div>
          <button className="icon-button shrink-0" type="button" title="Chiudi" onClick={onClose}>
            <X size={19} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {loading ? (
            <div className="flex min-h-52 items-center justify-center gap-3 text-sm font-semibold text-muted">
              <LoaderCircle className="animate-spin" size={20} /> Caricamento stima...
            </div>
          ) : null}
          {!loading && form && result && marketplaceSummary ? (
            <div className="grid gap-7">
              <section>
                <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                  <Calculator className="mt-0.5 shrink-0" size={19} />
                  <p>
                    Questa stima è interna. Verrà associata al lead ma non è ancora visibile nel Marketplace.
                  </p>
                </div>
                <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 shrink-0 text-green" size={19} />
                    <div>
                      <h3 className="text-base font-bold text-ink">Dati immobile per l&apos;analisi</h3>
                      <p className="mt-1 text-sm leading-5 text-muted">
                        Verifica i dati recuperati dalla scheda. Puoi correggerli prima della ricerca.
                      </p>
                    </div>
                  </div>
                  {bnbcalcInput ? (
                    <div className="mt-4 grid gap-4">
                      <TextInput
                        label="Indirizzo completo"
                        value={bnbcalcInput.fullAddress}
                        placeholder="Via, numero civico, città, provincia, Italia"
                        onChange={(value) => updateBnbcalc("fullAddress", value)}
                      />
                      <div className="grid gap-4 sm:grid-cols-3">
                        <NullableNumberInput
                          label="Numero di stanze/camere"
                          value={bnbcalcInput.bedrooms}
                          min={0}
                          max={50}
                          step={1}
                          onChange={(value) => updateBnbcalc("bedrooms", value)}
                        />
                        <NullableNumberInput
                          label="Numero di bagni"
                          value={bnbcalcInput.bathrooms}
                          min={0}
                          max={50}
                          step={0.5}
                          onChange={(value) => updateBnbcalc("bathrooms", value)}
                        />
                        <NullableNumberInput
                          label="Numero di posti letto"
                          value={bnbcalcInput.accommodates}
                          min={1}
                          max={100}
                          step={1}
                          onChange={(value) => updateBnbcalc("accommodates", value)}
                        />
                      </div>
                      <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs leading-5 text-muted">
                          Ogni analisi utilizza un credito BNBCalc. Un messaggio di conferma evita avvii accidentali.
                        </p>
                        <button
                          className="btn btn-primary shrink-0"
                          type="button"
                          disabled={!bnbcalcConfigured || analyzing}
                          onClick={() => void analyzeWithBnbcalc()}
                        >
                          {analyzing ? (
                            <LoaderCircle className="animate-spin" size={17} />
                          ) : (
                            <Sparkles size={17} />
                          )}
                          {analyzing ? "Analisi in corso..." : "Fai l'analisi"}
                        </button>
                      </div>
                      {!bnbcalcConfigured ? (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                          Chiave BNBCalc non configurata nell&apos;ambiente di produzione.
                        </p>
                      ) : null}
                      {analysisError ? <ErrorMessage text={analysisError} /> : null}
                      {lastAnalysis ? (
                        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
                          Ultima analisi disponibile: ADR {formatCurrency(lastAnalysis.adrEur)} · occupazione {formatPercentage(lastAnalysis.occupancyPercentage)}
                          {lastAnalysis.convertedFromUsd
                            ? " · importo convertito da USD in EUR con tasso BCE"
                            : " · valuta EUR"}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <NumberInput
                    label="ADR stimato per notte"
                    value={form.adrPerNight}
                    suffix="€"
                    min={0}
                    step={1}
                    onChange={(value) => update("adrPerNight", value)}
                  />
                  <NumberInput
                    label="Tasso di occupazione"
                    value={form.occupancyRate * 100}
                    suffix="%"
                    min={0}
                    max={100}
                    onChange={(value) => update("occupancyRate", value / 100)}
                  />
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 sm:p-5">
                <p className="section-kicker">Anteprima calcolo</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Summary label="Netto mensile immobile" value={formatCurrency(marketplaceSummary.monthlyNet)} featured />
                  <Summary label="Netto annuo immobile" value={formatCurrency(marketplaceSummary.annualNet)} />
                  <Summary label="Incasso lordo annuo" value={formatCurrency(result.gross_annual_revenue)} />
                  <Summary label="Costi OTA inclusa IVA" value={formatCurrency(result.ota_commission_gross)} />
                </div>
              </section>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                <input
                  className="mt-0.5 size-4 accent-emerald-700"
                  type="checkbox"
                  checked={form.isVisible}
                  onChange={(event) => update("isVisible", event.target.checked)}
                />
                <span>
                  <strong className="block">Mostra la stima nel Marketplace</strong>
                  <span className="mt-1 block leading-5">Il Property Manager potrà vedere l&apos;anteprima economica e aprire la stima dettagliata prima dell&apos;acquisto.</span>
                </span>
              </label>

              <details className="rounded-lg border border-slate-200 bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-bold text-ink sm:p-5">
                  <span className="flex items-center gap-2"><SlidersHorizontal size={17} /> Personalizza parametri per questo lead</span>
                  <span className="text-xs font-medium text-muted">Facoltativo</span>
                </summary>
                <div className="grid gap-5 border-t border-slate-200 p-4 sm:p-5">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <NumberInput label="Giorni disponibili" value={form.daysAvailable} min={1} max={366} onChange={(value) => update("daysAvailable", Math.round(value))} />
                    <NumberInput label="Fee PM" value={form.pmFeeRate * 100} suffix="%" min={0} max={100} onChange={(value) => update("pmFeeRate", value / 100)} />
                    <NumberInput label="IVA OTA" value={form.otaVatRate * 100} suffix="%" min={0} max={100} onChange={(value) => update("otaVatRate", value / 100)} />
                    <NumberInput label="Aliquota fiscale" value={form.taxRate * 100} suffix="%" min={0} max={100} onChange={(value) => update("taxRate", value / 100)} />
                  </div>
                  <fieldset className="grid gap-3">
                    <legend className="text-sm font-bold text-ink">Mix canali</legend>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <NumberInput label="Airbnb" value={form.airbnbMixRate * 100} suffix="%" min={0} max={100} onChange={(value) => update("airbnbMixRate", value / 100)} />
                      <NumberInput label="Booking" value={form.bookingMixRate * 100} suffix="%" min={0} max={100} onChange={(value) => update("bookingMixRate", value / 100)} />
                      <NumberInput label="Diretto" value={form.directMixRate * 100} suffix="%" min={0} max={100} onChange={(value) => update("directMixRate", value / 100)} />
                    </div>
                  </fieldset>
                  <fieldset className="grid gap-3">
                    <legend className="text-sm font-bold text-ink">Commissioni canali</legend>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <NumberInput label="Airbnb" value={form.airbnbCommissionRate * 100} suffix="%" min={0} max={100} onChange={(value) => update("airbnbCommissionRate", value / 100)} />
                      <NumberInput label="Booking" value={form.bookingCommissionRate * 100} suffix="%" min={0} max={100} onChange={(value) => update("bookingCommissionRate", value / 100)} />
                      <NumberInput label="Diretto" value={form.directCommissionRate * 100} suffix="%" min={0} max={100} onChange={(value) => update("directCommissionRate", value / 100)} />
                    </div>
                  </fieldset>
                </div>
              </details>
            </div>
          ) : null}
          {!loading && error && !form ? <ErrorMessage text={error} /> : null}
          {form && error ? <ErrorMessage text={error} /> : null}
        </div>

        <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button className="btn btn-secondary" type="button" disabled={saving} onClick={onClose}>Annulla</button>
          <button className="btn btn-secondary" type="button" disabled={loading || !form} onClick={() => setPreviewOpen(true)}>Apri anteprima</button>
          <button className="btn btn-primary" type="button" disabled={loading || saving || !form} onClick={() => void save()}>
            <Save size={17} /> {saving ? "Salvataggio..." : "Salva stima"}
          </button>
        </footer>
      </div>
      {previewOpen && form ? (
        <MarketplaceFinancialEstimatePreviewModal
          data={toPreviewData(form, logoUrl)}
          leadTitle={leadTitle}
          location={location}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
    </div>
  );
}

function toPreviewData(
  form: EstimateForm,
  logoUrl: string | null,
): MarketplaceFinancialEstimatePreviewData {
  return { ...form, logoUrl };
}

function toForm(estimate: ApiEstimate | null, template: ApiTemplate): EstimateForm {
  const source = estimate ?? template;
  return {
    adrPerNight: estimate?.adr_per_night ?? 0,
    occupancyRate: estimate?.occupancy_rate ?? 0,
    daysAvailable: source.days_available,
    pmFeeRate: source.pm_fee_rate,
    airbnbMixRate: source.airbnb_mix_rate,
    bookingMixRate: source.booking_mix_rate,
    directMixRate: source.direct_mix_rate,
    airbnbCommissionRate: source.airbnb_commission_rate,
    bookingCommissionRate: source.booking_commission_rate,
    directCommissionRate: source.direct_commission_rate,
    otaVatRate: source.ota_vat_rate,
    pmVatRate: source.pm_vat_rate,
    taxRate: source.tax_rate,
    otaCostLabel: source.ota_cost_label,
    managementCostLabel: source.management_cost_label,
    taxCostLabel: source.tax_cost_label,
    reportTitle: source.report_title,
    brandName: source.brand_name,
    headerText: source.header_text,
    contactDetails: source.contact_details,
    logoPath: source.logo_path,
    disclaimer: source.disclaimer,
    isVisible: estimate?.is_visible ?? false,
  };
}

function NumberInput({ label, value, onChange, suffix, ...input }: { label: string; value: number; onChange: (value: number) => void; suffix?: string } & Omit<React.ComponentProps<"input">, "value" | "onChange" | "type">) {
  return <label className="grid gap-2 text-sm font-semibold text-ink"><span>{label}</span><span className="relative"><input {...input} className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 pr-10 outline-none focus:border-green" type="number" value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(Number(event.target.value))} />{suffix ? <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-bold text-muted">{suffix}</span> : null}</span></label>;
}

function NullableNumberInput({ label, value, onChange, ...input }: { label: string; value: number | null; onChange: (value: number | null) => void } & Omit<React.ComponentProps<"input">, "value" | "onChange" | "type">) {
  return <label className="grid gap-2 text-sm font-semibold text-ink"><span>{label}</span><input {...input} className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 outline-none focus:border-green" type="number" value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} /></label>;
}

function TextInput({ label, value, onChange, ...input }: { label: string; value: string; onChange: (value: string) => void } & Omit<React.ComponentProps<"input">, "value" | "onChange" | "type">) {
  return <label className="grid gap-2 text-sm font-semibold text-ink"><span>{label}</span><input {...input} className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 outline-none focus:border-green" type="text" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Summary({ label, value, featured = false }: { label: string; value: string; featured?: boolean }) {
  return <div className={featured ? "rounded-lg bg-green p-4 text-white" : "rounded-lg border border-slate-200 bg-white p-4"}><p className={featured ? "text-xs font-bold uppercase tracking-wide text-green-50" : "text-xs font-bold uppercase tracking-wide text-muted"}>{label}</p><p className={featured ? "mt-2 text-xl font-bold" : "mt-2 text-lg font-bold text-ink"}>{value}</p></div>;
}

function ErrorMessage({ text }: { text: string }) {
  return <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{text}</p>;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    useGrouping: true,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercentage(value: number) {
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value) + "%";
}
