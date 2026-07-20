import { createClient } from "@supabase/supabase-js";
import { getEnv, requireEnv } from "@/lib/env";
import type { Database } from "./database.types";

export function createServiceSupabaseClient() {
  const secretKey = getEnv("SUPABASE_SECRET_KEY") ?? requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    secretKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
