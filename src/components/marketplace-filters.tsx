"use client";

import { useMemo, useState } from "react";
import { BellRing, ChevronDown, ChevronUp, Filter, RotateCcw } from "lucide-react";
import { LeadCard } from "@/components/lead-card";
import type { MarketplaceLead } from "@/lib/domain/sample-data";
import {
  isExclusiveAvailable,
  isSharedAvailable,
  parseLeadDate,
} from "@/lib/domain/lead-state";
import { ITALY_GEO } from "@/lib/geo/italy-geo";

type AvailabilityFilter =
  | "all"
  | "shared_available"
  | "exclusive_available"
  | "last_availability"
  | "unavailable";
type LeadTypeFilter = "all" | "in_target" | "verified";

type MarketplaceFiltersProps = {
  leads: MarketplaceLead[];
  detailBasePath?: string;
  sharedPurchasesEnabled?: boolean;
};

export function MarketplaceFilters({
  leads,
  detailBasePath = "/app/marketplace",
  sharedPurchasesEnabled = true,
}: MarketplaceFiltersProps) {
  const [region, setRegion] = useState("all");
  const [province, setProvince] = useState("all");
  const [city, setCity] = useState("all");
  const [availability, setAvailability] =
    useState<AvailabilityFilter>("all");
  const [leadType, setLeadType] = useState<LeadTypeFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const regions = useMemo(
    () => ITALY_GEO.map((item) => item.region),
    [],
  );
  const provinces = useMemo(
    () => getProvincesForRegion(region),
    [region],
  );
  const cities = useMemo(
    () => getCitiesForSelection(region, province),
    [province, region],
  );

  const filteredLeads = leads.filter((lead) => {
    if (region !== "all" && lead.region !== region) {
      return false;
    }

    if (province !== "all" && lead.province !== province) {
      return false;
    }

    if (city !== "all" && lead.city !== city) {
      return false;
    }

    if (leadType === "verified" && !lead.ownerVerified) {
      return false;
    }

    if (leadType === "in_target" && lead.ownerVerified) {
      return false;
    }

    if (availability === "all") {
      return true;
    }

    const expiresAt = parseLeadDate(lead.expiresAt);

    if (availability === "shared_available") {
      return isSharedAvailable({
        internalStatus: lead.internalStatus,
        sharedSlotsSold: lead.sharedSlotsSold,
        exclusivePurchaseId: lead.exclusivePurchaseId,
        expiresAt,
      });
    }

    if (availability === "exclusive_available") {
      return isExclusiveAvailable({
        internalStatus: lead.internalStatus,
        sharedSlotsSold: lead.sharedSlotsSold,
        exclusivePurchaseId: lead.exclusivePurchaseId,
        expiresAt,
      });
    }

    return lead.publicStatus === availability;
  });

  function resetFilters() {
    setRegion("all");
    setProvince("all");
    setCity("all");
    setAvailability("all");
    setLeadType("all");
  }

  const activeFiltersCount = [
    region !== "all",
    province !== "all",
    city !== "all",
    availability !== "all",
    leadType !== "all",
  ].filter(Boolean).length;

  function handleRegion(value: string) {
    setRegion(value);
    setProvince("all");
    setCity("all");
  }

  function handleProvince(value: string) {
    setProvince(value);
    setCity("all");
  }

  if (leads.length === 0) {
    return (
      <section className="card px-5 py-12 text-center sm:px-8 sm:py-16">
        <span className="mx-auto grid size-14 place-items-center rounded-xl bg-green/10 text-green">
          <BellRing size={26} />
        </span>
        <h2 className="mt-5 text-2xl font-semibold text-ink">
          Nessuna nuova opportunità disponibile in questo momento.
        </h2>
        <p className="mx-auto mt-3 max-w-xl leading-7 text-muted">
          Ti avviseremo quando arriveranno nuove richieste.
        </p>
      </section>
    );
  }

  return (
    <section className="min-w-0 max-w-full overflow-x-clip">
      <div className="card mb-4 min-w-0 max-w-full p-3 lg:hidden">
        <button
          className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left"
          type="button"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((current) => !current)}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-green/10 text-green">
              <Filter size={19} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold uppercase tracking-[0.12em] text-green">
                Filtri
              </span>
              <span className="mt-0.5 block text-sm text-muted">
                {activeFiltersCount
                  ? `${activeFiltersCount} ${activeFiltersCount === 1 ? "filtro attivo" : "filtri attivi"}`
                  : `${filteredLeads.length} lead disponibili`}
              </span>
            </span>
          </span>
          <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-slate-200 text-ink">
            {filtersOpen ? <ChevronUp size={19} /> : <ChevronDown size={19} />}
          </span>
        </button>

        {filtersOpen ? (
          <div className="mt-3 border-t border-slate-200 pt-4">
            <MarketplaceFilterControls
              region={region}
              province={province}
              city={city}
              leadType={leadType}
              availability={availability}
              regions={regions}
              provinces={provinces}
              cities={cities}
              sharedPurchasesEnabled={sharedPurchasesEnabled}
              onRegionChange={handleRegion}
              onProvinceChange={handleProvince}
              onCityChange={setCity}
              onLeadTypeChange={setLeadType}
              onAvailabilityChange={setAvailability}
              onReset={resetFilters}
            />
          </div>
        ) : null}
      </div>

      <div className="card mb-5 hidden min-w-0 max-w-full p-4 lg:block">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-green">
              <Filter size={16} />
              Filtri
            </p>
            <p className="mt-2 text-sm text-muted">
              {filteredLeads.length} lead mostrati su {leads.length}
            </p>
          </div>

          <MarketplaceFilterControls
            region={region}
            province={province}
            city={city}
            leadType={leadType}
            availability={availability}
            regions={regions}
            provinces={provinces}
            cities={cities}
            sharedPurchasesEnabled={sharedPurchasesEnabled}
            onRegionChange={handleRegion}
            onProvinceChange={handleProvince}
            onCityChange={setCity}
            onLeadTypeChange={setLeadType}
            onAvailabilityChange={setAvailability}
            onReset={resetFilters}
          />
        </div>
      </div>

      {filteredLeads.length > 0 ? (
        <div className="marketplace-grid">
          {filteredLeads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              detailBasePath={detailBasePath}
              sharedPurchasesEnabled={sharedPurchasesEnabled}
            />
          ))}
        </div>
      ) : (
        <div className="card p-8 text-center">
          <h2 className="text-2xl font-semibold text-ink">
            Nessun lead trovato
          </h2>
          <p className="mt-2 text-muted">
            Modifica i filtri per visualizzare altre opportunita.
          </p>
        </div>
      )}
    </section>
  );
}

function MarketplaceFilterControls({
  region,
  province,
  city,
  leadType,
  availability,
  regions,
  provinces,
  cities,
  sharedPurchasesEnabled,
  onRegionChange,
  onProvinceChange,
  onCityChange,
  onLeadTypeChange,
  onAvailabilityChange,
  onReset,
}: {
  region: string;
  province: string;
  city: string;
  leadType: LeadTypeFilter;
  availability: AvailabilityFilter;
  regions: string[];
  provinces: string[];
  cities: string[];
  sharedPurchasesEnabled: boolean;
  onRegionChange: (value: string) => void;
  onProvinceChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onLeadTypeChange: (value: LeadTypeFilter) => void;
  onAvailabilityChange: (value: AvailabilityFilter) => void;
  onReset: () => void;
}) {
  return (
    <div className="filters-grid w-full min-w-0 flex-1">
      <SelectFilter label="Regione" value={region} onChange={onRegionChange} options={regions} />
      <SelectFilter label="Provincia" value={province} onChange={onProvinceChange} options={provinces} />
      <SelectFilter label="Citta" value={city} onChange={onCityChange} options={cities} />
      <label className="filter-control grid gap-1 text-sm font-semibold text-ink">
        Tipologia Lead
        <select aria-label="Tipologia Lead" className="filter-select" value={leadType} onChange={(event) => onLeadTypeChange(event.target.value as LeadTypeFilter)}>
          <option value="all">Tutti i Lead</option>
          <option value="in_target">Lead Standard</option>
          <option value="verified">Lead Premium</option>
        </select>
      </label>
      <label className="filter-control grid gap-1 text-sm font-semibold text-ink">
        Disponibilita
        <select aria-label="Disponibilita" className="filter-select" value={availability} onChange={(event) => onAvailabilityChange(event.target.value as AvailabilityFilter)}>
          <option value="all">Tutti</option>
          {sharedPurchasesEnabled ? <option value="shared_available">Condiviso disponibile</option> : null}
          <option value="exclusive_available">Esclusiva disponibile</option>
          <option value="last_availability">Ultima disponibilita</option>
          <option value="unavailable">Non piu disponibile</option>
        </select>
      </label>
      <button className="btn btn-secondary min-w-0 self-end" type="button" onClick={onReset}>
        <RotateCcw size={16} />
        Reset
      </button>
    </div>
  );
}

function SelectFilter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="filter-control grid gap-1 text-sm font-semibold text-ink">
      {label}
      <select
        aria-label={label}
        className="filter-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="all">Tutti</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function unique(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "it"));
}

function getProvincesForRegion(region: string) {
  if (region === "all") {
    return unique(
      ITALY_GEO.flatMap((item) =>
        item.provinces.map((province) => province.province),
      ),
    );
  }

  const selectedRegion = ITALY_GEO.find((item) => item.region === region);

  return selectedRegion?.provinces.map((item) => item.province) ?? [];
}

function getCitiesForSelection(region: string, province: string) {
  const matchingRegions =
    region === "all"
      ? ITALY_GEO
      : ITALY_GEO.filter((item) => item.region === region);

  const cities = matchingRegions.flatMap((item) =>
    item.provinces
      .filter((currentProvince) =>
        province === "all" ? true : currentProvince.province === province,
      )
      .flatMap((currentProvince) => currentProvince.cities),
  );

  return unique(cities);
}
