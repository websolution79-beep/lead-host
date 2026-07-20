"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeEuro,
  MapPin,
  Plus,
  Save,
  Settings2,
  Trash2,
  WalletCards,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { formatCurrencyCents } from "@/lib/auth/roles";
import { ITALY_GEO } from "@/lib/geo/italy-geo";
import type {
  CommercialSettings,
  LeadPriceRule,
  PriceRuleScope,
} from "@/lib/config/commercial-settings";

type SettingsResponse = {
  settings: CommercialSettings;
  storageReady: boolean;
  error?: string;
};

type ActiveTab = "wallet" | "lead_prices" | "geo_rules";

const emptySettings: CommercialSettings = {
  minTopUpCents: 3000,
  quickTopUpCents: [3000, 5000, 10000],
  defaultSharedLeadPriceCents: 2900,
  defaultExclusiveLeadPriceCents: 5000,
  maxSharedBuyers: 2,
  priceRules: [],
};

export function AdminCommercialSettings() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [settings, setSettings] = useState<CommercialSettings>(emptySettings);
  const [activeTab, setActiveTab] = useState<ActiveTab>("wallet");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storageReady, setStorageReady] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();

    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadSettings = useCallback(async () => {
    const token = await getAccessToken();

    setLoading(true);
    setError("");
    setSuccess("");

    if (!token) {
      setError("Sessione admin non trovata.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/admin/settings/commercial", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json()) as SettingsResponse;

    if (!response.ok) {
      setError(payload.error ?? "Non riesco a caricare le impostazioni.");
      setLoading(false);
      return;
    }

    setSettings(payload.settings);
    setStorageReady(payload.storageReady);
    setLoading(false);
  }, [getAccessToken]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function saveSettings() {
    const token = await getAccessToken();

    setSaving(true);
    setError("");
    setSuccess("");

    if (!token) {
      setError("Sessione admin non trovata.");
      setSaving(false);
      return;
    }

    const response = await fetch("/api/admin/settings/commercial", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(settings),
    });
    const payload = (await response.json()) as SettingsResponse;

    if (!response.ok) {
      setError(payload.error ?? "Salvataggio impostazioni non riuscito.");
      setSaving(false);
      return;
    }

    setSettings(payload.settings);
    setSuccess("Impostazioni salvate.");
    setSaving(false);
  }

  function updateSettings(update: Partial<CommercialSettings>) {
    setSettings((current) => ({ ...current, ...update }));
  }

  function upsertRule(rule: LeadPriceRule) {
    setSettings((current) => ({
      ...current,
      priceRules: current.priceRules.some((item) => item.id === rule.id)
        ? current.priceRules.map((item) => (item.id === rule.id ? rule : item))
        : [rule, ...current.priceRules],
    }));
  }

  function deleteRule(ruleId: string) {
    setSettings((current) => ({
      ...current,
      priceRules: current.priceRules.filter((rule) => rule.id !== ruleId),
    }));
  }

  return (
    <div className="grid gap-6">
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="section-kicker">Regole commerciali</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">
              Impostazioni piattaforma
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              Queste regole governano ricariche wallet e prezzi suggeriti in fase di
              approvazione lead. Gli acquisti lead usano sempre il credito wallet interno.
            </p>
          </div>
          <button
            className="btn btn-primary"
            type="button"
            disabled={saving || loading}
            onClick={saveSettings}
          >
            <Save size={17} />
            {saving ? "Salvataggio..." : "Salva impostazioni"}
          </button>
        </div>

        {!storageReady ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            La tabella settings non e disponibile: sto usando i valori di fallback.
          </div>
        ) : null}

        {error ? (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="mt-5 rounded-xl border border-green/20 bg-green/10 p-4 text-sm font-semibold text-green">
            {success}
          </div>
        ) : null}
      </section>

      <div className="grid gap-2 rounded-xl bg-slate-100 p-1 lg:grid-cols-3">
        <TabButton
          active={activeTab === "wallet"}
          icon={WalletCards}
          label="Wallet"
          onClick={() => setActiveTab("wallet")}
        />
        <TabButton
          active={activeTab === "lead_prices"}
          icon={BadgeEuro}
          label="Prezzi lead"
          onClick={() => setActiveTab("lead_prices")}
        />
        <TabButton
          active={activeTab === "geo_rules"}
          icon={MapPin}
          label="Regole geografiche"
          onClick={() => setActiveTab("geo_rules")}
        />
      </div>

      {loading ? (
        <section className="card p-8 text-center text-muted">Carico impostazioni...</section>
      ) : null}

      {!loading && activeTab === "wallet" ? (
        <WalletSettings settings={settings} onChange={updateSettings} />
      ) : null}

      {!loading && activeTab === "lead_prices" ? (
        <LeadPriceSettings settings={settings} onChange={updateSettings} />
      ) : null}

      {!loading && activeTab === "geo_rules" ? (
        <GeoRulesSettings
          settings={settings}
          onUpsertRule={upsertRule}
          onDeleteRule={deleteRule}
        />
      ) : null}
    </div>
  );
}

function WalletSettings({
  settings,
  onChange,
}: {
  settings: CommercialSettings;
  onChange: (update: Partial<CommercialSettings>) => void;
}) {
  return (
    <section className="card p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-green/10 text-green">
          <WalletCards size={22} />
        </span>
        <div>
          <p className="section-kicker">Wallet</p>
          <h2 className="text-xl font-semibold text-ink">Ricariche wallet</h2>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <EuroField
          label="Importo minimo ricarica"
          valueCents={settings.minTopUpCents}
          onChange={(value) => onChange({ minTopUpCents: value })}
        />
        <label className="grid gap-2 text-sm font-semibold text-ink">
          Tagli rapidi ricarica
          <input
            className="min-h-12 rounded-lg border border-ink/12 px-4 outline-none focus:border-green"
            value={settings.quickTopUpCents.map((item) => item / 100).join(", ")}
            onChange={(event) =>
              onChange({ quickTopUpCents: parseEuroList(event.target.value) })
            }
          />
          <span className="text-xs font-medium leading-5 text-muted">
            Inserisci importi separati da virgola, esempio: 30, 50, 100.
          </span>
        </label>
      </div>
    </section>
  );
}

function LeadPriceSettings({
  settings,
  onChange,
}: {
  settings: CommercialSettings;
  onChange: (update: Partial<CommercialSettings>) => void;
}) {
  return (
    <section className="card p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-green/10 text-green">
          <BadgeEuro size={22} />
        </span>
        <div>
          <p className="section-kicker">Marketplace</p>
          <h2 className="text-xl font-semibold text-ink">Prezzi default lead</h2>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <EuroField
          label="Lead condiviso default"
          valueCents={settings.defaultSharedLeadPriceCents}
          onChange={(value) => onChange({ defaultSharedLeadPriceCents: value })}
        />
        <EuroField
          label="Lead esclusivo default"
          valueCents={settings.defaultExclusiveLeadPriceCents}
          onChange={(value) => onChange({ defaultExclusiveLeadPriceCents: value })}
        />
        <label className="grid gap-2 text-sm font-semibold text-ink">
          Quote condivise default
          <input
            className="min-h-12 rounded-lg border border-ink/12 px-4 outline-none focus:border-green"
            inputMode="numeric"
            min={1}
            max={5}
            value={settings.maxSharedBuyers}
            onChange={(event) =>
              onChange({
                maxSharedBuyers: Math.max(1, Number.parseInt(event.target.value, 10) || 1),
              })
            }
          />
        </label>
      </div>

      <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-muted">
        In approvazione lead questi prezzi vengono precompilati, ma l'admin puo
        modificarli sul singolo lead prima della pubblicazione.
      </div>
    </section>
  );
}

function GeoRulesSettings({
  settings,
  onUpsertRule,
  onDeleteRule,
}: {
  settings: CommercialSettings;
  onUpsertRule: (rule: LeadPriceRule) => void;
  onDeleteRule: (ruleId: string) => void;
}) {
  const [scope, setScope] = useState<PriceRuleScope>("city");
  const [region, setRegion] = useState("Lombardia");
  const [province, setProvince] = useState("Milano");
  const [city, setCity] = useState("Milano");
  const [sharedPriceCents, setSharedPriceCents] = useState(3500);
  const [exclusivePriceCents, setExclusivePriceCents] = useState(6000);

  const selectedRegion = ITALY_GEO.find((item) => item.region === region) ?? ITALY_GEO[0];
  const selectedProvince =
    selectedRegion.provinces.find((item) => item.province === province) ??
    selectedRegion.provinces[0];
  const selectedValue =
    scope === "region" ? region : scope === "province" ? province : city;

  useEffect(() => {
    if (!selectedRegion.provinces.some((item) => item.province === province)) {
      setProvince(selectedRegion.provinces[0]?.province ?? "");
    }
  }, [province, selectedRegion]);

  useEffect(() => {
    if (!selectedProvince.cities.includes(city)) {
      setCity(selectedProvince.cities[0] ?? "");
    }
  }, [city, selectedProvince]);

  function addRule() {
    onUpsertRule({
      id: crypto.randomUUID(),
      scope,
      value: selectedValue,
      sharedPriceCents,
      exclusivePriceCents,
      active: true,
    });
  }

  function toggleRule(rule: LeadPriceRule) {
    onUpsertRule({ ...rule, active: !rule.active });
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="card p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-green/10 text-green">
            <MapPin size={22} />
          </span>
          <div>
            <p className="section-kicker">Regole</p>
            <h2 className="text-xl font-semibold text-ink">Nuova regola geografica</h2>
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm font-semibold text-ink">
            Tipo regola
            <select
              className="filter-select"
              value={scope}
              onChange={(event) => setScope(event.target.value as PriceRuleScope)}
            >
              <option value="region">Regione</option>
              <option value="province">Provincia</option>
              <option value="city">Citta</option>
            </select>
          </label>

          <label className="grid gap-2 text-sm font-semibold text-ink">
            Regione
            <select
              className="filter-select"
              value={region}
              onChange={(event) => setRegion(event.target.value)}
            >
              {ITALY_GEO.map((item) => (
                <option key={item.region} value={item.region}>
                  {item.region}
                </option>
              ))}
            </select>
          </label>

          {scope !== "region" ? (
            <label className="grid gap-2 text-sm font-semibold text-ink">
              Provincia
              <select
                className="filter-select"
                value={province}
                onChange={(event) => setProvince(event.target.value)}
              >
                {selectedRegion.provinces.map((item) => (
                  <option key={item.province} value={item.province}>
                    {item.province}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {scope === "city" ? (
            <label className="grid gap-2 text-sm font-semibold text-ink">
              Citta
              <select
                className="filter-select"
                value={city}
                onChange={(event) => setCity(event.target.value)}
              >
                {selectedProvince.cities.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <EuroField
              label="Prezzo condiviso"
              valueCents={sharedPriceCents}
              onChange={setSharedPriceCents}
            />
            <EuroField
              label="Prezzo esclusivo"
              valueCents={exclusivePriceCents}
              onChange={setExclusivePriceCents}
            />
          </div>

          <button className="btn btn-primary" type="button" onClick={addRule}>
            <Plus size={17} />
            Aggiungi regola
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <p className="section-kicker">Priorita automatica</p>
          <h2 className="mt-2 text-xl font-semibold text-ink">Regole attive</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            La citta prevale sulla provincia, la provincia prevale sulla regione.
          </p>
        </div>

        {settings.priceRules.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {settings.priceRules.map((rule) => (
              <div key={rule.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_auto]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      {rule.scope === "city"
                        ? "Citta"
                        : rule.scope === "province"
                          ? "Provincia"
                          : "Regione"}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        rule.active
                          ? "bg-green/10 text-green"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {rule.active ? "Attiva" : "Disattiva"}
                    </span>
                  </div>
                  <p className="mt-3 text-lg font-semibold text-ink">{rule.value}</p>
                  <p className="mt-1 text-sm text-muted">
                    Condiviso {formatCurrencyCents(rule.sharedPriceCents)} - Esclusivo{" "}
                    {formatCurrencyCents(rule.exclusivePriceCents)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                    type="button"
                    onClick={() => toggleRule(rule)}
                  >
                    {rule.active ? "Disattiva" : "Attiva"}
                  </button>
                  <button
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
                    type="button"
                    onClick={() => onDeleteRule(rule.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center">
            <Settings2 className="mx-auto text-slate-400" size={34} />
            <p className="mt-3 font-semibold text-ink">Nessuna regola geografica</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Senza regole, tutti i lead useranno i prezzi default.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function TabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof WalletCards;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex min-h-12 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition ${
        active ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:bg-white/70"
      }`}
      type="button"
      onClick={onClick}
    >
      <Icon size={17} />
      {label}
    </button>
  );
}

function EuroField({
  label,
  valueCents,
  onChange,
}: {
  label: string;
  valueCents: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-ink">
      {label}
      <div className="flex min-h-12 items-center rounded-lg border border-ink/12 bg-white px-4 focus-within:border-green">
        <span className="pr-3 font-semibold text-slate-500">EUR</span>
        <input
          className="min-h-11 w-full bg-transparent outline-none"
          inputMode="decimal"
          value={valueCents / 100}
          onChange={(event) => onChange(parseEuroCents(event.target.value))}
        />
      </div>
    </label>
  );
}

function parseEuroCents(value: string) {
  const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
  const amount = Number.parseFloat(normalized);

  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
}

function parseEuroList(value: string) {
  const parsed = value
    .split(",")
    .map((item) => parseEuroCents(item))
    .filter((item) => item > 0);

  return parsed.length > 0 ? parsed : [3000];
}
