"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Home,
  Loader2,
  MapPin,
  Send,
  UserRound,
} from "lucide-react";
import { ITALY_GEO } from "@/lib/geo/italy-geo";

const propertyTypes = [
  "Appartamento",
  "Villa",
  "Casa indipendente",
  "B&B",
  "Struttura ricettiva",
  "Altro",
];

const currentStatuses = [
  "Gia su Airbnb/Booking",
  "Gia usato per affitti brevi",
  "Mai usato per affitti brevi",
  "Gestito personalmente",
  "Affidato a un altro gestore",
];

const requestedServices = [
  "Gestione completa",
  "Gestione online",
  "Gestione annunci",
  "Revenue management",
  "Comunicazione ospiti",
  "Check-in / Check-out",
  "Pulizie",
  "Non lo so, vorrei essere consigliato",
];

const timings = [
  "Il prima possibile",
  "Entro 30 giorni",
  "Entro 3 mesi",
  "Piu avanti",
  "Sto solo valutando",
];

const steps = [
  {
    icon: MapPin,
    title: "Dove si trova l'immobile",
    description: "Ci aiuterà a trovare il consulente migliore per la tua zona.",
  },
  {
    icon: Home,
    title: "Che immobile e",
    description: "Poche informazioni utili per capire il potenziale del lead.",
  },
  {
    icon: CheckCircle2,
    title: "Cosa stai cercando",
    description: "Servizi richiesti, tempistiche e una nota facoltativa.",
  },
  {
    icon: UserRound,
    title: "Ti manca un ultimo step",
    description:
      "I tuoi dati saranno visibili solo ad un massimo di 2 Consulenti esperti verificati.",
  },
];

type FormState = {
  region: string;
  province: string;
  city: string;
  address: string;
  propertyType: string;
  bedrooms: string;
  bathrooms: string;
  areaSqm: string;
  currentStatus: string[];
  requestedServices: string[];
  timing: string;
  description: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  privacyConsent: boolean;
  dataSharingConsent: boolean;
};

const initialFormState: FormState = {
  region: "",
  province: "",
  city: "",
  address: "",
  propertyType: "",
  bedrooms: "",
  bathrooms: "",
  areaSqm: "",
  currentStatus: [],
  requestedServices: [],
  timing: "",
  description: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  privacyConsent: false,
  dataSharingConsent: false,
};

type OwnerRequestFormProps = {
  variant?: "page" | "embed";
  completionToken?: string;
  initialValues?: Partial<FormState>;
};

export function OwnerRequestForm({
  variant = "page",
  completionToken,
  initialValues,
}: OwnerRequestFormProps) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>({
    ...initialFormState,
    ...initialValues,
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successReference, setSuccessReference] = useState("");
  const [website, setWebsite] = useState("");
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  const regions = useMemo(() => ITALY_GEO.map((item) => item.region), []);
  const provinces = useMemo(() => getProvincesForRegion(form.region), [form.region]);
  const cities = useMemo(
    () => getCitiesForSelection(form.region, form.province),
    [form.province, form.region],
  );

  const progress = ((step + 1) / steps.length) * 100;
  const currentStep = steps[step];
  const CurrentIcon = currentStep.icon;

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleRegion(value: string) {
    setForm((current) => ({
      ...current,
      region: value,
      province: "",
      city: "",
    }));
  }

  function handleProvince(value: string) {
    setForm((current) => ({
      ...current,
      province: value,
      city: "",
    }));
  }

  function toggleListValue(key: "currentStatus" | "requestedServices", value: string) {
    setForm((current) => {
      const values = current[key];
      return {
        ...current,
        [key]: values.includes(value)
          ? values.filter((item) => item !== value)
          : [...values, value],
      };
    });
  }

  function goNext() {
    const validationError = validateStep(step, form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  function goBack() {
    setError("");
    setStep((current) => Math.max(current - 1, 0));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateStep(step, form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setIsSubmitting(true);

    const url = new URL(window.location.href);
    const utmSource =
      url.searchParams.get("utm_source") ||
      url.searchParams.get("source") ||
      (variant === "embed" ? "embed" : undefined);
    const utmMedium =
      url.searchParams.get("utm_medium") ||
      (variant === "embed" ? "iframe" : undefined);

    const response = await fetch(
      completionToken
        ? `/api/owner-requests/completion/${encodeURIComponent(completionToken)}`
        : "/api/owner-requests",
      {
        method: completionToken ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...form,
        website,
        startedAt: startedAt.current ?? 0,
        bedrooms: Number(form.bedrooms),
        bathrooms: Number(form.bathrooms),
        areaSqm: Number(form.areaSqm),
        attribution: {
          landingPage: window.location.href,
          referrer: document.referrer,
          utmSource,
          utmMedium,
          utmCampaign: url.searchParams.get("utm_campaign") || undefined,
          utmContent: url.searchParams.get("utm_content") || undefined,
          utmTerm: url.searchParams.get("utm_term") || undefined,
        },
      }),
      },
    );

    const result = (await response.json()) as {
      reference?: string;
      error?: string;
    };

    setIsSubmitting(false);

    if (!response.ok) {
      setError(result.error ?? "Non sono riuscito a inviare la richiesta.");
      return;
    }

    setSuccessReference(result.reference ?? "");
  }

  if (successReference) {
    return (
      <div className={variant === "embed" ? "rounded-xl bg-white p-5 sm:p-6" : "card p-6 sm:p-8"}>
        <div className="flex size-12 items-center justify-center rounded-xl bg-green/10 text-green">
          <CheckCircle2 size={26} />
        </div>
        <p className="section-kicker mt-6">Richiesta ricevuta</p>
        <h2 className="mt-3 text-3xl font-semibold text-ink">
          La tua richiesta e stata inviata.
        </h2>
        <p className="mt-4 leading-7 text-muted">
          {completionToken
            ? "Abbiamo ricevuto tutti i dati. La richiesta passa ora alla verifica del team Lead Host."
            : "La verificheremo prima di pubblicarla nel marketplace. Se approvata, potrai essere contattato da massimo 2 Property Manager interessati."}
        </p>
        <p className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-ink">
          Codice richiesta: {successReference}
        </p>
      </div>
    );
  }

  return (
    <form
      className={variant === "embed" ? "overflow-hidden rounded-xl bg-white shadow-sm" : "card overflow-hidden"}
      onSubmit={handleSubmit}
    >
      <div
        aria-hidden="true"
        className="fixed -left-[10000px] top-auto h-px w-px overflow-hidden"
      >
        <label>
          Sito web
          <input
            name="company_website"
            type="text"
            autoComplete="off"
            tabIndex={-1}
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </label>
      </div>
      <div className="border-b border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-green/10 text-green">
              <CurrentIcon size={22} />
            </span>
            <div>
              <p className="section-kicker">
                Step {step + 1} di {steps.length}
              </p>
              <h2 className="mt-1 text-2xl font-semibold text-ink">
                {currentStep.title}
              </h2>
            </div>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {Math.round(progress)}%
          </span>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted">{currentStep.description}</p>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-green transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {step === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Regione"
              value={form.region}
              options={regions}
              placeholder="Seleziona regione"
              onChange={handleRegion}
            />
            <SelectField
              label="Provincia"
              value={form.province}
              options={provinces}
              placeholder="Seleziona provincia"
              onChange={handleProvince}
              disabled={!form.region}
            />
            <SelectField
              label="Citta"
              value={form.city}
              options={cities}
              placeholder="Seleziona citta"
              onChange={(value) => updateField("city", value)}
              disabled={!form.province}
            />
            <TextField
              label="Indirizzo"
              value={form.address}
              placeholder="Es. Via Roma 10"
              onChange={(value) => updateField("address", value)}
            />
          </div>
        ) : null}

        {step === 1 ? (
          <div className="grid gap-4">
            <SelectField
              label="Tipologia immobile"
              value={form.propertyType}
              options={propertyTypes}
              placeholder="Seleziona tipologia"
              onChange={(value) => updateField("propertyType", value)}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField
                label="Camere"
                value={form.bedrooms}
                min={0}
                onChange={(value) => updateField("bedrooms", value)}
              />
              <NumberField
                label="Bagni"
                value={form.bathrooms}
                min={0}
                onChange={(value) => updateField("bathrooms", value)}
              />
              <NumberField
                label="Metratura indicativa"
                value={form.areaSqm}
                min={10}
                suffix="mq"
                onChange={(value) => updateField("areaSqm", value)}
              />
            </div>
            <OptionGrid
              label="Stato attuale"
              options={currentStatuses}
              selected={form.currentStatus}
              onToggle={(value) => toggleListValue("currentStatus", value)}
            />
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-4">
            <OptionGrid
              label="Servizi richiesti"
              options={requestedServices}
              selected={form.requestedServices}
              onToggle={(value) => toggleListValue("requestedServices", value)}
            />
            <SelectField
              label="Quando vorresti iniziare?"
              value={form.timing}
              options={timings}
              placeholder="Seleziona tempistica"
              onChange={(value) => updateField("timing", value)}
            />
            <label className="grid gap-2 text-sm font-semibold text-ink">
              Descrizione breve facoltativa
              <textarea
                className="min-h-28 resize-y rounded-lg border border-ink/12 px-4 py-3 outline-none focus:border-green"
                maxLength={700}
                placeholder="Raccontaci in poche parole cosa cerchi"
                value={form.description}
                onChange={(event) => updateField("description", event.target.value)}
              />
            </label>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Nome"
              value={form.firstName}
              onChange={(value) => updateField("firstName", value)}
            />
            <TextField
              label="Cognome"
              value={form.lastName}
              onChange={(value) => updateField("lastName", value)}
            />
            <TextField
              label="Email"
              value={form.email}
              type="email"
              onChange={(value) => updateField("email", value)}
            />
            <TextField
              label="Telefono"
              value={form.phone}
              type="tel"
              onChange={(value) => updateField("phone", value)}
            />
            <div className="grid gap-3 sm:col-span-2">
              <ConsentCheckbox
                checked={form.privacyConsent}
                label="Accetto il trattamento dei dati secondo la Privacy Policy."
                onChange={(checked) => updateField("privacyConsent", checked)}
              />
              <ConsentCheckbox
                checked={form.dataSharingConsent}
                label="Accetto che i miei contatti possano essere condivisi con massimo 2 Consulenti esperti verificati."
                onChange={(checked) => updateField("dataSharingConsent", checked)}
              />
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <button
          className="btn btn-secondary"
          type="button"
          onClick={goBack}
          disabled={step === 0 || isSubmitting}
        >
          <ArrowLeft size={17} />
          Indietro
        </button>
        {step < steps.length - 1 ? (
          <button className="btn btn-primary" type="button" onClick={goNext}>
            Continua
            <ArrowRight size={17} />
          </button>
        ) : (
          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" size={17} /> : <Send size={17} />}
            {isSubmitting ? "Invio in corso..." : "Invia richiesta"}
          </button>
        )}
      </div>
    </form>
  );
}

function TextField({
  label,
  value,
  placeholder,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-ink">
      {label}
      <input
        className="min-h-12 rounded-lg border border-ink/12 px-4 outline-none focus:border-green"
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  suffix,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  suffix?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-ink">
      {label}
      <div className="flex min-h-12 items-center rounded-lg border border-ink/12 bg-white px-4 focus-within:border-green">
        <input
          className="min-w-0 flex-1 bg-transparent outline-none"
          type="number"
          min={min}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix ? <span className="text-sm font-semibold text-muted">{suffix}</span> : null}
      </div>
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-ink">
      {label}
      <select
        className="min-h-12 rounded-lg border border-ink/12 bg-white px-4 outline-none focus:border-green disabled:bg-slate-50 disabled:text-slate-400"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function OptionGrid({
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
    <fieldset className="grid gap-3">
      <legend className="text-sm font-semibold text-ink">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const isSelected = selected.includes(option);

          return (
            <button
              key={option}
              className={`min-h-12 rounded-lg border px-4 text-left text-sm font-semibold transition ${
                isSelected
                  ? "border-green bg-green/10 text-green"
                  : "border-slate-200 bg-white text-slate-700 hover:border-green/40"
              }`}
              type="button"
              onClick={() => onToggle(option)}
            >
              {option}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ConsentCheckbox({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm font-semibold leading-6 text-ink">
      <input
        className="mt-1 size-4 accent-green"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function validateStep(step: number, form: FormState) {
  if (step === 0) {
    if (!form.region || !form.province || !form.city || !form.address.trim()) {
      return "Completa regione, provincia, citta e indirizzo.";
    }
  }

  if (step === 1) {
    if (!form.propertyType || !form.bedrooms || !form.bathrooms || !form.areaSqm) {
      return "Completa tipologia, camere, bagni e metratura.";
    }
    if (form.currentStatus.length === 0) {
      return "Seleziona almeno uno stato attuale dell'immobile.";
    }
  }

  if (step === 2) {
    if (form.requestedServices.length === 0 || !form.timing) {
      return "Seleziona almeno un servizio e una tempistica.";
    }
  }

  if (step === 3) {
    if (
      !form.firstName.trim() ||
      !form.lastName.trim() ||
      !form.email.trim() ||
      !form.phone.trim()
    ) {
      return "Tutti i campi dovranno essere compilati per l'invio della richiesta.";
    }
    if (!form.privacyConsent || !form.dataSharingConsent) {
      return "Per inviare la richiesta servono entrambi i consensi.";
    }
  }

  return "";
}

function unique(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "it"));
}

function getProvincesForRegion(region: string) {
  const selectedRegion = ITALY_GEO.find((item) => item.region === region);

  return selectedRegion?.provinces.map((item) => item.province) ?? [];
}

function getCitiesForSelection(region: string, province: string) {
  const selectedRegion = ITALY_GEO.find((item) => item.region === region);
  const selectedProvince = selectedRegion?.provinces.find(
    (item) => item.province === province,
  );

  return unique(selectedProvince?.cities ?? []);
}
