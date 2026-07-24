"use client";

import { useMemo, useState } from "react";
import { BellRing, Filter, RotateCcw } from "lucide-react";
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

type MarketplaceFiltersProps = {
  leads: MarketplaceLead[];
};

export function MarketplaceFilters({ leads }: MarketplaceFiltersProps) {
  const [region, setRegion] = useState("all");
  const [province, setProvince] = useState("all");
  const [city, setCity] = useState("all");
  const [availability, setAvailability] =
    useState<AvailabilityFilter>("all");

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
  }

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
    <section>
      <div className="card mb-5 p-4">
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

          <div className="filters-grid flex-1">
            <SelectFilter
              label="Regione"
              value={region}
              onChange={handleRegion}
              options={regions}
            />
            <SelectFilter
              label="Provincia"
              value={province}
              onChange={handleProvince}
              options={provinces}
            />
            <SelectFilter
              label="Citta"
              value={city}
              onChange={setCity}
              options={cities}
            />
            <label className="filter-control grid gap-1 text-sm font-semibold text-ink">
              Disponibilita
              <select
                aria-label="Disponibilita"
                className="filter-select"
                value={availability}
                onChange={(event) =>
                  setAvailability(event.target.value as AvailabilityFilter)
                }
              >
                <option value="all">Tutti</option>
                <option value="shared_available">Condiviso disponibile</option>
                <option value="exclusive_available">Esclusiva disponibile</option>
                <option value="last_availability">Ultima disponibilita</option>
                <option value="unavailable">Non piu disponibile</option>
              </select>
            </label>
            <button
              className="btn btn-secondary min-w-0 self-end"
              type="button"
              onClick={resetFilters}
            >
              <RotateCcw size={16} />
              Reset
            </button>
          </div>
        </div>
      </div>

      {filteredLeads.length > 0 ? (
        <div className="marketplace-grid">
          {filteredLeads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
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
