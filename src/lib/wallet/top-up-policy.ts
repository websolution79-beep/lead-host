import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommercialSettings } from "@/lib/config/commercial-settings";
import type { Database } from "@/lib/supabase/database.types";

type WalletClient = SupabaseClient<Database>;

export type WalletTopUpPolicy = {
  hasCompletedTopUp: boolean;
  isFirstTopUp: boolean;
  firstTopUpMinCents: number;
  subsequentTopUpMinCents: number;
  effectiveMinTopUpCents: number;
};

export async function resolveWalletTopUpPolicy({
  supabase,
  profileId,
  settings,
}: {
  supabase: WalletClient;
  profileId: string;
  settings: CommercialSettings;
}): Promise<WalletTopUpPolicy> {
  const { data, error } = await supabase
    .from("wallet_transactions")
    .select("id")
    .eq("profile_id", profileId)
    .eq("type", "top_up")
    .eq("status", "completed")
    .limit(1);

  if (error) throw error;

  const hasCompletedTopUp = Boolean(data?.length);

  return {
    hasCompletedTopUp,
    isFirstTopUp: !hasCompletedTopUp,
    firstTopUpMinCents: settings.firstTopUpMinCents,
    subsequentTopUpMinCents: settings.minTopUpCents,
    effectiveMinTopUpCents: hasCompletedTopUp
      ? settings.minTopUpCents
      : settings.firstTopUpMinCents,
  };
}
