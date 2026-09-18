import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { getEnv } from "@/lib/env";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { MARKETPLACE_MEMBERSHIP_ROLLOUT_READY } from "@/lib/marketplace-membership/settings";
import { reconcilePrimeMarketplace } from "@/lib/marketplace-membership/prime-reconciliation";
import { recoverMarketplaceRenewals } from "@/lib/marketplace-membership/recovery-sweep";
import { marketplaceCurrentStatuses } from "@/lib/marketplace-membership/subscription";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = getEnv("CRON_SECRET");
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!MARKETPLACE_MEMBERSHIP_ROLLOUT_READY) return NextResponse.json({ skipped: "rollout_disabled" });
  try {
    const key = getEnv("STRIPE_SECRET_KEY");
    if (!key) throw new Error("Stripe not configured");
    const stripe = new Stripe(key, { timeout: 10000, maxNetworkRetries: 1 });
    const db = createServiceSupabaseClient();
    const { data: product, error } = await db.from("addon_products").select("id").eq("slug", "marketplace").single();
    if (error) throw error;
    const result = await recoverMarketplaceRenewals({
      loadPage: async (afterId) => {
        let query = db.from("addon_subscriptions").select("id,profile_id")
          .eq("addon_product_id", product.id).eq("source", "stripe")
          .in("status", [...marketplaceCurrentStatuses]).eq("cancel_at_period_end", false)
          .order("id").limit(100);
        if (afterId) query = query.gt("id", afterId);
        const { data, error } = await query;
        if (error) throw error;
        return data ?? [];
      },
      reconcile: async (profileId) => { await reconcilePrimeMarketplace(stripe, profileId); },
      onError: (id, error) => console.error("Marketplace renewal recovery failed", id,
        error instanceof Error ? error.message : "Unknown error"),
    });
    return NextResponse.json({ ok: result.failed === 0, ...result }, { status: result.failed ? 503 : 200 });
  } catch (error) {
    console.error("Marketplace renewal recovery unavailable", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Recupero rinnovi Marketplace non completato." }, { status: 503 });
  }
}
