import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

type ServiceClient = SupabaseClient<Database>;

export type PrimeAccessState = {
  hasAccess: boolean;
  isEligible: boolean;
  isVisible: boolean;
  status: Database["public"]["Tables"]["prime_accounts"]["Row"]["status"] | null;
  expiresAt: string | null;
  graceEndsAt: string | null;
};

export async function getPrimeAccessState(
  profileId: string,
  client?: ServiceClient,
): Promise<PrimeAccessState> {
  const supabase = client ?? createServiceSupabaseClient();
  const [accountResult, eligibilityResult] = await Promise.all([
    supabase
      .from("prime_accounts")
      .select("status,prime_expires_at,grace_ends_at")
      .eq("profile_id", profileId)
      .maybeSingle(),
    supabase
      .from("prime_eligibilities")
      .select("is_enabled")
      .eq("profile_id", profileId)
      .maybeSingle(),
  ]);

  const data = accountResult.data;
  const isEligible = Boolean(!eligibilityResult.error && eligibilityResult.data?.is_enabled);
  if (accountResult.error || !data) {
    return {
      hasAccess: false,
      isEligible,
      isVisible: isEligible,
      status: null,
      expiresAt: null,
      graceEndsAt: null,
    };
  }

  const now = Date.now();
  const hasAccess =
    (data.status === "active" &&
      (!data.prime_expires_at || new Date(data.prime_expires_at).getTime() > now)) ||
    (data.status === "past_due" &&
      Boolean(data.grace_ends_at && new Date(data.grace_ends_at).getTime() > now));

  return {
    hasAccess,
    isEligible,
    isVisible: hasAccess || isEligible,
    status: data.status,
    expiresAt: data.prime_expires_at,
    graceEndsAt: data.grace_ends_at,
  };
}
