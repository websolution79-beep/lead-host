import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type ServiceClient = SupabaseClient<Database>;

export type TeamCompensationSettings = {
  featureEnabled: boolean;
  leadVerificationCents: number;
  primeFirstActivationCents: number;
  primeRenewalCents: number;
  primeLeadPurchaseBasisPoints: number;
  currency: "EUR";
};

type TeamCompensationSettingsRow = {
  feature_enabled: boolean | null;
  lead_verification_cents: number | null;
  prime_first_activation_cents: number | null;
  prime_renewal_cents: number | null;
  prime_lead_purchase_basis_points: number | null;
  currency: string | null;
};

export const defaultTeamCompensationSettings: TeamCompensationSettings = {
  featureEnabled: false,
  leadVerificationCents: 300,
  primeFirstActivationCents: 5_000,
  primeRenewalCents: 2_000,
  primeLeadPurchaseBasisPoints: 1_000,
  currency: "EUR",
};

export async function fetchTeamCompensationSettings(
  supabase: ServiceClient,
): Promise<{
  settings: TeamCompensationSettings;
  storageReady: boolean;
}> {
  const settingsTable = supabase.from(
    "team_compensation_settings" as never,
  ) as unknown as {
    select: (columns: string) => {
      limit: (count: number) => {
        maybeSingle: () => Promise<{
          data: TeamCompensationSettingsRow | null;
          error: { code?: string; message?: string } | null;
        }>;
      };
    };
  };

  try {
    const { data, error } = await settingsTable
      .select(
        "feature_enabled,lead_verification_cents,prime_first_activation_cents,prime_renewal_cents,prime_lead_purchase_basis_points,currency",
      )
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return failClosedSettings(false);
    }

    return {
      settings: normalizeTeamCompensationSettings(data),
      storageReady: true,
    };
  } catch {
    return failClosedSettings(false);
  }
}

export async function isTeamCompensationEnabled(
  supabase: ServiceClient,
): Promise<boolean> {
  const { settings } = await fetchTeamCompensationSettings(supabase);
  return settings.featureEnabled;
}

export function normalizeTeamCompensationSettings(
  row: TeamCompensationSettingsRow,
): TeamCompensationSettings {
  return {
    featureEnabled: row.feature_enabled === true,
    leadVerificationCents: parseNonNegativeInteger(
      row.lead_verification_cents,
      defaultTeamCompensationSettings.leadVerificationCents,
    ),
    primeFirstActivationCents: parseNonNegativeInteger(
      row.prime_first_activation_cents,
      defaultTeamCompensationSettings.primeFirstActivationCents,
    ),
    primeRenewalCents: parseNonNegativeInteger(
      row.prime_renewal_cents,
      defaultTeamCompensationSettings.primeRenewalCents,
    ),
    primeLeadPurchaseBasisPoints: parseBasisPoints(
      row.prime_lead_purchase_basis_points,
      defaultTeamCompensationSettings.primeLeadPurchaseBasisPoints,
    ),
    currency: "EUR",
  };
}

function failClosedSettings(storageReady: boolean) {
  return {
    settings: { ...defaultTeamCompensationSettings },
    storageReady,
  };
}

function parseNonNegativeInteger(value: number | null, fallback: number) {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : fallback;
}

function parseBasisPoints(value: number | null, fallback: number) {
  const parsed = parseNonNegativeInteger(value, fallback);
  return parsed <= 10_000 ? parsed : fallback;
}
