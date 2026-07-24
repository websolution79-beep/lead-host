import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

type ServiceClient = SupabaseClient<Database>;

export type TelegramChannelSettings = {
  enabled: boolean;
  messageTemplate: string;
};

const SETTINGS_KEY = "telegram.channel_settings";

export const telegramTemplateVariables = [
  "title",
  "location",
  "city",
  "province",
  "property_type",
  "shared_price",
  "exclusive_price",
  "available_slots",
  "max_shared_slots",
] as const;

export const defaultTelegramChannelSettings: TelegramChannelSettings = {
  enabled: false,
  messageTemplate: [
    "NUOVA OPPORTUNITÀ SU LEAD HOST",
    "",
    "{{title}}",
    "Località: {{location}}",
    "Tipologia: {{property_type}}",
    "",
    "Condiviso: {{shared_price}}",
    "Esclusiva: {{exclusive_price}}",
    "Quote disponibili: {{available_slots}}/{{max_shared_slots}}",
    "",
    "Accedi al marketplace e valuta il lead prima che venga acquistato.",
  ].join("\n"),
};

type SettingsRow = {
  value: Json;
};

export async function fetchTelegramChannelSettings(supabase: ServiceClient) {
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
      settings: defaultTelegramChannelSettings,
      storageReady: false,
    };
  }

  return {
    settings: parseTelegramSettings(data?.value),
    storageReady: true,
  };
}

export async function saveTelegramChannelSettings({
  supabase,
  profileId,
  settings,
}: {
  supabase: ServiceClient;
  profileId: string;
  settings: TelegramChannelSettings;
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

function parseTelegramSettings(value: Json | undefined): TelegramChannelSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaultTelegramChannelSettings;
  }

  const record = value as Record<string, Json>;
  const template =
    typeof record.messageTemplate === "string" && record.messageTemplate.trim()
      ? record.messageTemplate.trim()
      : defaultTelegramChannelSettings.messageTemplate;

  return {
    enabled: record.enabled === true,
    messageTemplate: template,
  };
}
