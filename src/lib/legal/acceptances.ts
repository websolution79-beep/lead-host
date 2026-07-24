import type { Json } from "@/lib/supabase/database.types";
import type { createServiceSupabaseClient } from "@/lib/supabase/server";

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

type TermsAcceptanceInput =
  | {
      profileId: string;
      context: "wallet_top_up";
      termsVersion: string;
      walletTransactionId: string;
      metadata?: Json;
    }
  | {
      profileId: string;
      context: "lead_purchase";
      termsVersion: string;
      leadPurchaseId: string;
      metadata?: Json;
    };

export async function recordTermsAcceptance(
  supabase: ServiceSupabaseClient,
  input: TermsAcceptanceInput,
) {
  const table = (supabase as unknown as {
    from: (name: "terms_acceptances") => {
      insert: (row: Record<string, unknown>) => Promise<{
        error: { code?: string; message?: string } | null;
      }>;
    };
  }).from("terms_acceptances");

  return table.insert({
    profile_id: input.profileId,
    context: input.context,
    terms_version: input.termsVersion,
    wallet_transaction_id:
      input.context === "wallet_top_up" ? input.walletTransactionId : null,
    lead_purchase_id:
      input.context === "lead_purchase" ? input.leadPurchaseId : null,
    metadata: input.metadata ?? {},
  });
}

