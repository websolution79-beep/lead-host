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
  firstTopUpMinCents: number;
  minTopUpCents: number;
  quickTopUpCents: number[];
  leadAvailabilityDays: number;
  inTargetSharedLeadPriceCents: number;
  inTargetExclusiveLeadPriceCents: number;
  verifiedSharedLeadPriceCents: number;
  verifiedExclusiveLeadPriceCents: number;
  sharedPurchasesEnabled: boolean;
  maxSharedBuyers: number;
  unavailableVisibilityDays: number;
  soldVisibilityDays: number;
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
  firstTopUpMinCents: "wallet.first_top_up_min_cents",
  minTopUpCents: "wallet.min_top_up_cents",
  quickTopUpCents: "wallet.quick_top_up_cents",
  leadAvailabilityDays: "lead.availability_days",
  legacySharedPriceCents: "lead.shared_price_cents",
  legacyExclusivePriceCents: "lead.exclusive_price_cents",
  inTargetSharedPriceCents: "lead.in_target_shared_price_cents",
  inTargetExclusivePriceCents: "lead.in_target_exclusive_price_cents",
  verifiedSharedPriceCents: "lead.verified_shared_price_cents",
  verifiedExclusivePriceCents: "lead.verified_exclusive_price_cents",
  sharedPurchasesEnabled: "lead.shared_purchases_enabled",
  maxSharedBuyers: "lead.max_shared_buyers",
  unavailableVisibilityDays: "lead.unavailable_visibility_days",
  soldVisibilityDays: "lead.sold_visibility_days",
  priceRules: "lead.price_rules",
} as const;

export const defaultCommercialSettings: CommercialSettings = {
  firstTopUpMinCents: 3000,
  minTopUpCents: 1000,
  quickTopUpCents: [3000, 5000, 10000],
  leadAvailabilityDays: 7,
  inTargetSharedLeadPriceCents: commercialRules.sharedLeadPriceCents,
  inTargetExclusiveLeadPriceCents: commercialRules.exclusiveLeadPriceCents,
  verifiedSharedLeadPriceCents: commercialRules.sharedLeadPriceCents,
  verifiedExclusiveLeadPriceCents: commercialRules.exclusiveLeadPriceCents,
  sharedPurchasesEnabled: true,
  maxSharedBuyers: commercialRules.maxSharedBuyers,
  unavailableVisibilityDays: commercialRules.unavailableVisibilityDays,
  soldVisibilityDays: commercialRules.soldVisibilityDays,
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
    firstTopUpMinCents: parseCents(
      values.get(SETTINGS_KEYS.firstTopUpMinCents),
      defaultCommercialSettings.firstTopUpMinCents,
    ),
    minTopUpCents: parseCents(
      values.get(SETTINGS_KEYS.minTopUpCents),
      defaultCommercialSettings.minTopUpCents,
    ),
    quickTopUpCents: parseCentsArray(
      values.get(SETTINGS_KEYS.quickTopUpCents),
      defaultCommercialSettings.quickTopUpCents,
    ),
    leadAvailabilityDays: parsePositiveInteger(
      values.get(SETTINGS_KEYS.leadAvailabilityDays),
      defaultCommercialSettings.leadAvailabilityDays,
    ),
    inTargetSharedLeadPriceCents: parseCents(
      values.get(SETTINGS_KEYS.inTargetSharedPriceCents),
      parseCents(
        values.get(SETTINGS_KEYS.legacySharedPriceCents),
        defaultCommercialSettings.inTargetSharedLeadPriceCents,
      ),
    ),
    inTargetExclusiveLeadPriceCents: parseCents(
      values.get(SETTINGS_KEYS.inTargetExclusivePriceCents),
      parseCents(
        values.get(SETTINGS_KEYS.legacyExclusivePriceCents),
        defaultCommercialSettings.inTargetExclusiveLeadPriceCents,
      ),
    ),
    verifiedSharedLeadPriceCents: parseCents(
      values.get(SETTINGS_KEYS.verifiedSharedPriceCents),
      parseCents(
        values.get(SETTINGS_KEYS.legacySharedPriceCents),
        defaultCommercialSettings.verifiedSharedLeadPriceCents,
      ),
    ),
    verifiedExclusiveLeadPriceCents: parseCents(
      values.get(SETTINGS_KEYS.verifiedExclusivePriceCents),
      parseCents(
        values.get(SETTINGS_KEYS.legacyExclusivePriceCents),
        defaultCommercialSettings.verifiedExclusiveLeadPriceCents,
      ),
    ),
    sharedPurchasesEnabled: parseBoolean(
      values.get(SETTINGS_KEYS.sharedPurchasesEnabled),
      defaultCommercialSettings.sharedPurchasesEnabled,
    ),
    maxSharedBuyers: parsePositiveInteger(
      values.get(SETTINGS_KEYS.maxSharedBuyers),
      defaultCommercialSettings.maxSharedBuyers,
    ),
    unavailableVisibilityDays: parseNonNegativeInteger(
      values.get(SETTINGS_KEYS.unavailableVisibilityDays),
      defaultCommercialSettings.unavailableVisibilityDays,
    ),
    soldVisibilityDays: parseNonNegativeInteger(
      values.get(SETTINGS_KEYS.soldVisibilityDays),
      defaultCommercialSettings.soldVisibilityDays,
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
      key: SETTINGS_KEYS.firstTopUpMinCents,
      value: settings.firstTopUpMinCents,
      updated_by: profileId,
    },
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
      key: SETTINGS_KEYS.leadAvailabilityDays,
      value: settings.leadAvailabilityDays,
      updated_by: profileId,
    },
    {
      key: SETTINGS_KEYS.inTargetSharedPriceCents,
      value: settings.inTargetSharedLeadPriceCents,
      updated_by: profileId,
    },
    {
      key: SETTINGS_KEYS.inTargetExclusivePriceCents,
      value: settings.inTargetExclusiveLeadPriceCents,
      updated_by: profileId,
    },
    {
      key: SETTINGS_KEYS.verifiedSharedPriceCents,
      value: settings.verifiedSharedLeadPriceCents,
      updated_by: profileId,
    },
    {
      key: SETTINGS_KEYS.verifiedExclusivePriceCents,
      value: settings.verifiedExclusiveLeadPriceCents,
      updated_by: profileId,
    },
    {
      key: SETTINGS_KEYS.sharedPurchasesEnabled,
      value: settings.sharedPurchasesEnabled,
      updated_by: profileId,
    },
    {
      key: SETTINGS_KEYS.maxSharedBuyers,
      value: settings.maxSharedBuyers,
      updated_by: profileId,
    },
    {
      key: SETTINGS_KEYS.unavailableVisibilityDays,
      value: settings.unavailableVisibilityDays,
      updated_by: profileId,
    },
    {
      key: SETTINGS_KEYS.soldVisibilityDays,
      value: settings.soldVisibilityDays,
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
  ownerVerified = false,
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
    sharedPriceCents: ownerVerified
      ? settings.verifiedSharedLeadPriceCents
      : settings.inTargetSharedLeadPriceCents,
    exclusivePriceCents: ownerVerified
      ? settings.verifiedExclusiveLeadPriceCents
      : settings.inTargetExclusiveLeadPriceCents,
    source: "default",
    label: ownerVerified
      ? "Prezzo default Lead verificato"
      : "Prezzo default Lead in target",
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

function parseBoolean(value: Json | undefined, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function parsePositiveInteger(value: Json | undefined, fallback: number) {
  const parsed = parseCents(value, fallback);

  return parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInteger(value: Json | undefined, fallback: number) {
  const parsed = parseCents(value, fallback);

  return parsed >= 0 ? parsed : fallback;
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
