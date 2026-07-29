import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

type ServiceClient = SupabaseClient<Database>;

export type OwnerLeadApiSettings = {
  enabled: boolean;
  tokenHash: string | null;
  tokenPrefix: string | null;
  createdAt: string | null;
  rotatedAt: string | null;
};

const SETTINGS_KEY = "acquisition.owner_lead_api";

export const defaultOwnerLeadApiSettings: OwnerLeadApiSettings = {
  enabled: false,
  tokenHash: null,
  tokenPrefix: null,
  createdAt: null,
  rotatedAt: null,
};

type SettingsRow = {
  value: Json;
};

export async function fetchOwnerLeadApiSettings(supabase: ServiceClient) {
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
      settings: defaultOwnerLeadApiSettings,
      storageReady: false,
    };
  }

  return {
    settings: parseOwnerLeadApiSettings(data?.value),
    storageReady: true,
  };
}

export async function saveOwnerLeadApiSettings({
  supabase,
  profileId,
  settings,
}: {
  supabase: ServiceClient;
  profileId: string;
  settings: OwnerLeadApiSettings;
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

export function generateOwnerLeadApiToken() {
  const secret = `lh_ingest_${randomBytes(32).toString("base64url")}`;

  return {
    secret,
    tokenHash: hashOwnerLeadApiToken(secret),
    tokenPrefix: `${secret.slice(0, 18)}...`,
  };
}

export function verifyOwnerLeadApiToken(
  providedToken: string,
  expectedHash: string | null,
) {
  if (!providedToken || !expectedHash) return false;

  const providedHash = Buffer.from(hashOwnerLeadApiToken(providedToken), "hex");
  const storedHash = Buffer.from(expectedHash, "hex");

  return (
    providedHash.length === storedHash.length &&
    timingSafeEqual(providedHash, storedHash)
  );
}

function hashOwnerLeadApiToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function parseOwnerLeadApiSettings(
  value: Json | undefined,
): OwnerLeadApiSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaultOwnerLeadApiSettings;
  }

  const record = value as Record<string, Json>;

  return {
    enabled: record.enabled === true,
    tokenHash:
      typeof record.tokenHash === "string" && record.tokenHash
        ? record.tokenHash
        : null,
    tokenPrefix:
      typeof record.tokenPrefix === "string" && record.tokenPrefix
        ? record.tokenPrefix
        : null,
    createdAt:
      typeof record.createdAt === "string" && record.createdAt
        ? record.createdAt
        : null,
    rotatedAt:
      typeof record.rotatedAt === "string" && record.rotatedAt
        ? record.rotatedAt
        : null,
  };
}
