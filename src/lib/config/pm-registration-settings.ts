import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

type ServiceClient = SupabaseClient<Database>;

export type PmRegistrationSettings = {
  open: boolean;
};

const SETTINGS_KEY = "platform.pm_registration";

export const defaultPmRegistrationSettings: PmRegistrationSettings = {
  open: true,
};

type SettingsRow = {
  value: Json;
};

export async function fetchPmRegistrationSettings(supabase: ServiceClient) {
  const settingsTable = supabase.from("settings") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: SettingsRow | null;
          error: { code?: string; message?: string } | null;
        }>;
      };
    };
  };
  const { data, error } = await settingsTable
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    return {
      settings: defaultPmRegistrationSettings,
      storageReady: false,
    };
  }

  return {
    settings: parsePmRegistrationSettings(data?.value),
    storageReady: true,
  };
}

export async function savePmRegistrationSettings({
  supabase,
  profileId,
  settings,
}: {
  supabase: ServiceClient;
  profileId: string;
  settings: PmRegistrationSettings;
}) {
  const settingsTable = supabase.from("settings") as unknown as {
    upsert: (
      row: { key: string; value: Json; updated_by: string },
      options: { onConflict: string },
    ) => Promise<{ error: { code?: string; message?: string } | null }>;
  };
  const { error } = await settingsTable.upsert(
    {
      key: SETTINGS_KEY,
      value: settings,
      updated_by: profileId,
    },
    { onConflict: "key" },
  );

  if (error) throw error;
}

function parsePmRegistrationSettings(
  value: Json | undefined,
): PmRegistrationSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaultPmRegistrationSettings;
  }

  const record = value as Record<string, Json>;

  return {
    open: record.open !== false,
  };
}
