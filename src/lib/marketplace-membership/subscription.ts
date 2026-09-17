import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const marketplaceCurrentStatuses = ["incomplete", "trialing", "active", "past_due", "paused", "unpaid"] as const;

export async function loadMarketplaceSubscription(db: SupabaseClient<Database>, profileId: string) {
  const { data: product, error: productError } = await db.from("addon_products")
    .select("id,stripe_product_id,status,checkout_enabled").eq("slug", "marketplace").single();
  if (productError) throw productError;
  const { data: subscription, error } = await db.from("addon_subscriptions").select("*")
    .eq("addon_product_id", product.id).eq("profile_id", profileId)
    .in("status", [...marketplaceCurrentStatuses]).order("created_at", { ascending: false })
    .limit(1).maybeSingle();
  if (error) throw error;
  return { product, subscription };
}
