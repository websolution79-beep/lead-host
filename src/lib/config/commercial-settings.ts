import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { commercialRules } from "@/lib/config/commercial";

type ServiceClient = SupabaseClient<Database>;

export type PriceRuleScope = "region" | "province" | "city";

export type LeadPriceRule = {
  id: string;
  scope: PriceRuleScope;
  value: string;
  sharedPriceCents: number;
  exclusivePriceCents: number;
  active: boolean;
};

export type CommercialSettings = {
  minTopUpCents: number;
  quickTopUpCents: number[];
  defaultSharedLeadPriceCents: number;
  defaultExclusiveLeadPriceCents: number;
  maxSharedBuyers: number;
  priceRules: LeadPriceRule[];
};

export type LeadPricingSuggestion = {
  sharedPriceCents: number;
  exclusivePriceCents: number;
  source: "city" | "province" | "region" | "default" | "published";
  label: string;
  ruleId: string | null;
};

const SETTINGS_KEYS = {
  minTopUpCents: "wallet.min_top_up_cents",
  quickTopUpCents: "wallet.quick_top_up_cents",
  sharedPriceCents: "lead.shared_price_cents",
  exclusivePriceCents: "lead.exclusive_price_cents",
  maxSharedBuyers: "lead.max_shared_buyers",
  priceRules: "lead.price_rules",
} as const;

export const defaultCommercialSettings: CommercialSettings = {
  minTopUpCents: 3000,
  quickTopUpCents: [3000, 5000, 10000],
  defaultSharedLeadPriceCents: commercialRules.sharedLeadPriceCents,
  defaultExclusiveLeadPriceCents: commercialRules.exclusiveLeadPriceCents,
  maxSharedBuyers: commercialRules.maxSharedBuyers,
  priceRules: [],
};

type SettingsRow = {
  key: string;
  value: Json;
};

export async function fetchCommercialSettings(supabase: ServiceClient) {
  const settingsTable = supabase.from("settings") as unknown as {
    select: (columns: string) => {
      in: (column: string, values: string[]) => Promise<{
        data: SettingsRow[] | null;
        error: { code?: string; message?: string } | null;
      }>;
    };
  };

  const { data, error } = await settingsTable
    .select("key,value")
    .in("key", Object.values(SETTINGS_KEYS));

  if (error) {
    if (isMissingRelationError(error)) {
      return {
        settings: defaultCommercialSettings,
        storageReady: false,
      };
    }

    throw error;
  }

  const values = new Map((data ?? []).map((row) => [row.key, row.value]));
  const settings: CommercialSettings = {
    minTopUpCents: parseCents(
      values.get(SETTINGS_KEYS.minTopUpCents),
      defaultCommercialSettings.minTopUpCents,
    ),
    quickTopUpCents: parseCentsArray(
      values.get(SETTINGS_KEYS.quickTopUpCents),
      defaultCommercialSettings.quickTopUpCents,
    ),
    defaultSharedLeadPriceCents: parseCents(
      values.get(SETTINGS_KEYS.sharedPriceCents),
      defaultCommercialSettings.defaultSharedLeadPriceCents,
    ),
    defaultExclusiveLeadPriceCents: parseCents(
      values.get(SETTINGS_KEYS.exclusivePriceCents),
      defaultCommercialSettings.defaultExclusiveLeadPriceCents,
    ),
    maxSharedBuyers: parsePositiveInteger(
      values.get(SETTINGS_KEYS.maxSharedBuyers),
      defaultCommercialSettings.maxSharedBuyers,
    ),
    priceRules: parsePriceRules(values.get(SETTINGS_KEYS.priceRules)),
  };

  return {
    settings,
    storageReady: true,
  };
}

export async function saveCommercialSettings({
  supabase,
  profileId,
  settings,
}: {
  supabase: ServiceClient;
  profileId: string;
  settings: CommercialSettings;
}) {
  const rows = [
    {
      key: SETTINGS_KEYS.minTopUpCents,
      value: settings.minTopUpCents,
      updated_by: profileId,
    },
    {
      key: SETTINGS_KEYS.quickTopUpCents,
      value: settings.quickTopUpCents,
      updated_by: profileId,
    },
    {
      key: SETTINGS_KEYS.sharedPriceCents,
      value: settings.defaultSharedLeadPriceCents,
      updated_by: profileId,
    },
    {
      key: SETTINGS_KEYS.exclusivePriceCents,
      value: settings.defaultExclusiveLeadPriceCents,
      updated_by: profileId,
    },
    {
      key: SETTINGS_KEYS.maxSharedBuyers,
      value: settings.maxSharedBuyers,
      updated_by: profileId,
    },
    {
      key: SETTINGS_KEYS.priceRules,
      value: settings.priceRules,
      updated_by: profileId,
    },
  ];

  const settingsTable = supabase.from("settings") as unknown as {
    upsert: (
      rows: Array<{ key: string; value: Json; updated_by: string }>,
      options: { onConflict: string },
    ) => Promise<{ error: { code?: string; message?: string } | null }>;
  };
  const { error } = await settingsTable.upsert(rows, { onConflict: "key" });

  if (error) throw error;
}

export function resolveLeadPricing(
  settings: CommercialSettings,
  location: {
    region?: string | null;
    province?: string | null;
    city?: string | null;
  },
): LeadPricingSuggestion {
  const orderedRules = settings.priceRules
    .filter((rule) => rule.active)
    .sort((a, b) => scopeWeight(b.scope) - scopeWeight(a.scope));
  const match = orderedRules.find((rule) => {
    const sourceValue = location[rule.scope];

    return normalizeLocationValue(sourceValue) === normalizeLocationValue(rule.value);
  });

  if (match) {
    return {
      sharedPriceCents: match.sharedPriceCents,
      exclusivePriceCents: match.exclusivePriceCents,
      source: match.scope,
      label: `${scopeLabel(match.scope)}: ${match.value}`,
      ruleId: match.id,
    };
  }

  return {
    sharedPriceCents: settings.defaultSharedLeadPriceCents,
    exclusivePriceCents: settings.defaultExclusiveLeadPriceCents,
    source: "default",
    label: "Prezzo default",
    ruleId: null,
  };
}

export function eurosToCents(value: number) {
  return Math.round(value * 100);
}

export function centsToEuroInput(value: number) {
  return String(value / 100);
}

function parseCents(value: Json | undefined, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }

  return fallback;
}

function parseCentsArray(value: Json | undefined, fallback: number[]) {
  if (!Array.isArray(value)) return fallback;
  const parsed = value
    .map((item) => parseCents(item, 0))
    .filter((item) => item > 0);

  return parsed.length > 0 ? parsed : fallback;
}

function parsePositiveInteger(value: Json | undefined, fallback: number) {
  const parsed = parseCents(value, fallback);

  return parsed > 0 ? parsed : fallback;
}

function parsePriceRules(value: Json | undefined): LeadPriceRule[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => parsePriceRule(item))
    .filter((item): item is LeadPriceRule => Boolean(item));
}

function parsePriceRule(value: Json): LeadPriceRule | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, Json>;
  const scope = record.scope;
  const areaValue = record.value;
  const sharedPriceCents = parseCents(record.sharedPriceCents, 0);
  const exclusivePriceCents = parseCents(record.exclusivePriceCents, 0);

  if (!["region", "province", "city"].includes(String(scope))) return null;
  if (typeof areaValue !== "string" || !areaValue.trim()) return null;
  if (sharedPriceCents <= 0 || exclusivePriceCents <= 0) return null;

  return {
    id: typeof record.id === "string" ? record.id : crypto.randomUUID(),
    scope: scope as PriceRuleScope,
    value: areaValue.trim(),
    sharedPriceCents,
    exclusivePriceCents,
    active: typeof record.active === "boolean" ? record.active : true,
  };
}

function normalizeLocationValue(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function scopeWeight(scope: PriceRuleScope) {
  if (scope === "city") return 3;
  if (scope === "province") return 2;

  return 1;
}

function scopeLabel(scope: PriceRuleScope) {
  if (scope === "city") return "Citta";
  if (scope === "province") return "Provincia";

  return "Regione";
}

function isMissingRelationError(error: { code?: string; message?: string }) {
  return (
    error.code === "PGRST205" ||
    error.message?.toLowerCase().includes("could not find the table")
  );
}
