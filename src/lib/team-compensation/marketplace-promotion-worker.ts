import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// Replay durable sales even when new claims have been disabled; refunds remain due.
export async function runMarketplacePromotionWorkerSafely(batchSize = 25) {
  try {
    const supabase = createServiceSupabaseClient();
    const rpc = supabase as unknown as {
      rpc: (name: string, args: { p_limit: number }) => Promise<{
        data: unknown; error: { code?: string; message?: string } | null;
      }>;
    };
    const limit = Number.isFinite(batchSize) ? Math.max(1, Math.min(100, Math.trunc(batchSize))) : 25;
    const { data, error } = await rpc.rpc("reconcile_marketplace_promotion_compensations", { p_limit: limit });
    if (error && ["PGRST202", "42883"].includes(error.code ?? "")) return { storageReady: false };
    if (error) throw new Error(error.message ?? "Elaborazione promozioni non riuscita.");
    return { storageReady: true, result: data };
  } catch (error) {
    console.error("Marketplace promotion compensation worker failed:", error instanceof Error ? error.message : "Errore sconosciuto.");
    return { storageReady: false, failed: true };
  }
}
