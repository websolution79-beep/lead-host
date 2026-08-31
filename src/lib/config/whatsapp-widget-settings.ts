import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

type ServiceClient = SupabaseClient<Database>;

const SETTINGS_KEYS = {
  enabled: "support.whatsapp_widget_enabled",
  businessNumber: "support.whatsapp_business_number",
  prefilledMessage: "support.whatsapp_prefilled_message",
} as const;

type SettingsRow = {
  key: string;
  value: Json;
};

export type WhatsAppWidgetSettings = {
  enabled: boolean;
  businessNumber: string;
  prefilledMessage: string;
};

export const defaultWhatsAppWidgetSettings: WhatsAppWidgetSettings = {
  enabled: true,
  businessNumber: "393882497011",
  prefilledMessage: "Ciao, avrei bisogno di informazioni generali su Lead Host.",
};

export async function fetchWhatsAppWidgetSettings(supabase: ServiceClient) {
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

  if (error) throw error;

  const values = new Map((data ?? []).map((row) => [row.key, row.value]));

  return {
    settings: {
      enabled: parseBoolean(
        values.get(SETTINGS_KEYS.enabled),
        defaultWhatsAppWidgetSettings.enabled,
      ),
      businessNumber: parseBusinessNumber(
        values.get(SETTINGS_KEYS.businessNumber),
        defaultWhatsAppWidgetSettings.businessNumber,
      ),
      prefilledMessage: parseMessage(
        values.get(SETTINGS_KEYS.prefilledMessage),
        defaultWhatsAppWidgetSettings.prefilledMessage,
      ),
    },
  };
}

export async function saveWhatsAppWidgetSettings({
  supabase,
  profileId,
  settings,
}: {
  supabase: ServiceClient;
  profileId: string;
  settings: WhatsAppWidgetSettings;
}) {
  const settingsTable = supabase.from("settings") as unknown as {
    upsert: (
      rows: Array<{ key: string; value: Json; updated_by: string }>,
      options: { onConflict: string },
    ) => Promise<{ error: { code?: string; message?: string } | null }>;
  };

  const { error } = await settingsTable.upsert(
    [
      { key: SETTINGS_KEYS.enabled, value: settings.enabled, updated_by: profileId },
      {
        key: SETTINGS_KEYS.businessNumber,
        value: settings.businessNumber,
        updated_by: profileId,
      },
      {
        key: SETTINGS_KEYS.prefilledMessage,
        value: settings.prefilledMessage,
        updated_by: profileId,
      },
    ],
    { onConflict: "key" },
  );

  if (error) throw error;
}

function parseBoolean(value: Json | undefined, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function parseBusinessNumber(value: Json | undefined, fallback: string) {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/\D/g, "");

  return normalized.length >= 8 && normalized.length <= 15 ? normalized : fallback;
}

function parseMessage(value: Json | undefined, fallback: string) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();

  return normalized.length > 0 && normalized.length <= 500 ? normalized : fallback;
}
