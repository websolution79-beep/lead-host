import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

type ServiceClient = SupabaseClient<Database>;

export type PrimeAccessState = {
  hasAccess: boolean;
  status: Database["public"]["Tables"]["prime_accounts"]["Row"]["status"] | null;
  expiresAt: string | null;
};

export async function getPrimeAccessState(
  profileId: string,
  client?: ServiceClient,
): Promise<PrimeAccessState> {
  const supabase = client ?? createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("prime_accounts")
    .select("status,prime_expires_at")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error || !data) {
    return { hasAccess: false, status: null, expiresAt: null };
  }

  const hasAccess =
    data.status === "active" &&
    (!data.prime_expires_at ||
      new Date(data.prime_expires_at).getTime() > Date.now());

  return {
    hasAccess,
    status: data.status,
    expiresAt: data.prime_expires_at,
  };
}
