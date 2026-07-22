"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, MapPin, Plus, Trash2 } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { ITALY_GEO } from "@/lib/geo/italy-geo";
import type { PmOperationArea, PmServiceCode } from "@/lib/property-manager/operations";

type ServiceOption = {
  code: PmServiceCode;
  label: string;
};

type OperationsResponse = {
  serviceOptions: ServiceOption[];
  operations: {
    services: Array<{
      code: PmServiceCode;
      label: string;
    }>;
    areas: PmOperationArea[];
  };
  error?: string;
};

export function PmOperationsCenter() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [serviceOptions, setServiceOptions] = useState<ServiceOption[]>([]);
  const [selectedServices, setSelectedServices] = useState<PmServiceCode[]>([]);
  const [areas, setAreas] = useState<PmOperationArea[]>([]);
  const [scope, setScope] = useState<PmOperationArea["scope"]>("city");
  const [region, setRegion] = useState("");
  const [province, setProvince] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const regions = useMemo(() => ITALY_GEO.map((item) => item.region), []);
  const provinces = useMemo(() => getProvinces(region), [region]);
  const cities = useMemo(() => getCities(region, province), [province, region]);

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();

    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadOperations = useCallback(async () => {
    const token = await getAccessToken();

    if (!token) {
      setLoading(false);
      return;
    }

    const response = await fetch("/api/property-manager/operations", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json()) as OperationsResponse;

    if (!response.ok) {
      setError(payload.error ?? "Non sono riuscito a caricare l'operatività.");
      setLoading(false);
      return;
    }

    setServiceOptions(payload.serviceOptions ?? []);
    setSelectedServices((payload.operations?.services ?? []).map((service) => service.code));
    setAreas(payload.operations?.areas ?? []);
    setLoading(false);
  }, [getAccessToken]);

  useEffect(() => {
    void loadOperations();
  }, [loadOperations]);

  function toggleService(code: PmServiceCode) {
    setSelectedServices((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code)
        : [...current, code],
    );
  }

  function addArea() {
    setError("");
    setMessage("");

    if (!region || (scope !== "region" && !province) || (scope === "city" && !city)) {
      setError("Completa i campi della zona prima di aggiungerla.");
      return;
    }

    const nextArea: PmOperationArea = {
      scope,
      region,
      province: scope === "region" ? null : province,
      city: scope === "city" ? city : null,
    };
    const key = areaKey(nextArea);

    setAreas((current) =>
      current.some((area) => areaKey(area) === key) ? current : [...current, nextArea],
    );
  }

  async function saveOperations(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!selectedServices.length || !areas.length) {
      setError("Seleziona almeno un servizio e una zona operativa.");
      return;
    }

    const token = await getAccessToken();

    if (!token) {
      setError("Sessione non trovata. Effettua di nuovo il login.");
      return;
    }

    setSaving(true);

    const response = await fetch("/api/property-manager/operations", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        services: selectedServices,
        areas,
      }),
    });
    const payload = (await response.json()) as OperationsResponse;

    setSaving(false);

    if (!response.ok) {
      setError(payload.error ?? "Non sono riuscito a salvare l'operatività.");
      return;
    }

    setAreas(payload.operations?.areas ?? areas);
    setSelectedServices((payload.operations?.services ?? []).map((service) => service.code));
    setMessage("Operatività aggiornata. Il matching dei lead userà queste preferenze.");
  }

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="section-kicker">Operatività</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">
            Servizi e aree coperte
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Questi dati servono per mostrarti quanto ogni lead è coerente con il
            tuo modello operativo.
          </p>
        </div>
        <span className="flex size-11 items-center justify-center rounded-xl bg-green/10 text-green">
          <BriefcaseBusiness size={22} />
        </span>
      </div>

      {loading ? (
        <p className="mt-6 text-sm font-semibold text-muted">Caricamento operatività...</p>
      ) : (
        <form className="mt-6 grid gap-6" onSubmit={saveOperations}>
          <fieldset className="grid gap-3">
            <legend className="text-sm font-bold text-ink">Servizi offerti</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {serviceOptions.map((service) => {
                const checked = selectedServices.includes(service.code);

                return (
                  <button
                    key={service.code}
                    className={`min-h-12 rounded-lg border px-4 text-left text-sm font-semibold transition ${
                      checked
                        ? "border-green bg-green/10 text-green"
                        : "border-slate-200 bg-white text-slate-700 hover:border-green/40"
                    }`}
                    type="button"
                    onClick={() => toggleService(service.code)}
                  >
                    {service.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="grid gap-3">
            <legend className="text-sm font-bold text-ink">Aree operative</legend>
            <div className="grid gap-3 lg:grid-cols-[150px_1fr_1fr_1fr_auto]">
              <SelectField
                label="Livello"
                value={scope}
                onChange={(value) => {
                  setScope(value as PmOperationArea["scope"]);
                  setProvince("");
                  setCity("");
                }}
                options={[
                  { value: "region", label: "Regione" },
                  { value: "province", label: "Provincia" },
                  { value: "city", label: "Città" },
                ]}
              />
              <SelectField
                label="Regione"
                value={region}
                onChange={(value) => {
                  setRegion(value);
                  setProvince("");
                  setCity("");
                }}
                options={regions.map((item) => ({ value: item, label: item }))}
              />
              <SelectField
                label="Provincia"
                value={province}
                disabled={!region || scope === "region"}
                onChange={(value) => {
                  setProvince(value);
                  setCity("");
                }}
                options={provinces.map((item) => ({ value: item, label: item }))}
              />
              <SelectField
                label="Città"
                value={city}
                disabled={!province || scope !== "city"}
                onChange={setCity}
                options={cities.map((item) => ({ value: item, label: item }))}
              />
              <button className="btn btn-secondary self-end" type="button" onClick={addArea}>
                <Plus size={17} />
                Aggiungi
              </button>
            </div>

            {areas.length ? (
              <div className="flex flex-wrap gap-2">
                {areas.map((area) => (
                  <span
                    key={areaKey(area)}
                    className="inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700"
                  >
                    <MapPin size={13} />
                    {formatArea(area)}
                    <button
                      className="text-slate-400 hover:text-red-600"
                      type="button"
                      aria-label={`Rimuovi ${formatArea(area)}`}
                      onClick={() =>
                        setAreas((current) =>
                          current.filter((item) => areaKey(item) !== areaKey(area)),
                        )
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-muted">
                Nessuna area aggiunta. Puoi aggiungere regioni, province o singole città.
              </p>
            )}
          </fieldset>

          {message ? (
            <p className="rounded-lg border border-green/20 bg-green/8 px-4 py-3 text-sm font-semibold text-green">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          ) : null}

          <button className="btn btn-primary" disabled={saving} type="submit">
            {saving ? "Salvataggio..." : "Salva operatività"}
          </button>
        </form>
      )}
    </section>
  );
}

function SelectField({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
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
        <option value="">Seleziona</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function getProvinces(region: string) {
  return ITALY_GEO.find((item) => item.region === region)?.provinces.map(
    (item) => item.province,
  ) ?? [];
}

function getCities(region: string, province: string) {
  const selectedRegion = ITALY_GEO.find((item) => item.region === region);
  const selectedProvince = selectedRegion?.provinces.find(
    (item) => item.province === province,
  );

  return Array.from(new Set(selectedProvince?.cities ?? [])).sort((a, b) =>
    a.localeCompare(b, "it"),
  );
}

function areaKey(area: PmOperationArea) {
  return [area.scope, area.region, area.province ?? "", area.city ?? ""].join("|");
}

function formatArea(area: PmOperationArea) {
  if (area.scope === "city") return `${area.city}, ${area.province}`;
  if (area.scope === "province") return `${area.province}, ${area.region}`;

  return area.region;
}
