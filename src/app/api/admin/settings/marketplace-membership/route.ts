import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { getEnv } from "@/lib/env";
import { AdminApiError, adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { marketplaceMembershipSettingsSchema } from "@/lib/marketplace-membership/policy";
import {
  fetchMarketplaceMembershipSettings, MARKETPLACE_MEMBERSHIP_SETTINGS_KEY,
  MARKETPLACE_MEMBERSHIP_ROLLOUT_READY,
} from "@/lib/marketplace-membership/settings";

async function context(request: NextRequest) {
  const result = await requireSuperAdmin(request);
  if (!result.isSuperAdmin) throw new AdminApiError(403, "Ruolo Super Admin richiesto.");
  return result;
}

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await context(request);
    const { data: product, error } = await supabase.from("addon_products")
      .select("stripe_product_id").eq("slug", "marketplace").maybeSingle();
    if (error) throw error;
    return NextResponse.json({ ...await fetchMarketplaceMembershipSettings(supabase),
      stripeProductId: product?.stripe_product_id ?? null,
      activationAvailable: MARKETPLACE_MEMBERSHIP_ROLLOUT_READY },
    { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return adminApiErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile, isSuperAdmin } = await context(request);
    const key = getEnv("STRIPE_SECRET_KEY");
    if (!key) throw new AdminApiError(503, "Stripe non configurato sul server.");
    const { data: local, error } = await supabase.from("addon_products")
      .select("id,stripe_product_id").eq("slug", "marketplace").single();
    if (error) throw error;
    const stripe = new Stripe(key);
    let productId = local.stripe_product_id;
    if (productId) {
      const existing = await stripe.products.retrieve(productId);
      if (existing.deleted) throw new AdminApiError(409, "Il prodotto collegato risulta eliminato su Stripe.");
    } else {
      // Full listing avoids the indexing delay of Stripe product search on retries.
      for await (const product of stripe.products.list({ limit: 100 })) {
        if (product.metadata.leadhost_addon_slug === "marketplace") {
          productId = product.id;
          break;
        }
      }
      if (!productId) {
        const created = await stripe.products.create({
          name: "Marketplace Lead Host",
          description: "Abbonamento mensile al Marketplace pubblico di Lead Host",
          metadata: { leadhost_addon_slug: "marketplace", managed_by: "leadhost" },
        }, { idempotencyKey: `leadhost-marketplace-product-${local.id}` });
        productId = created.id;
      }
      const { error: saveError } = await supabase.from("addon_products")
        .update({ stripe_product_id: productId, updated_by: profile.id })
        .eq("id", local.id).is("stripe_product_id", null);
      if (saveError) throw saveError;
    }
    await writeAdminAuditLog({ supabase, request, actorProfileId: profile.id, isSuperAdmin,
      entityType: "addon_product", entityId: local.id, action: "marketplace.stripe_product_linked",
      before: { stripeProductId: local.stripe_product_id }, after: { stripeProductId: productId } });
    return NextResponse.json({ stripeProductId: productId });
  } catch (error) { return adminApiErrorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile, isSuperAdmin } = await context(request);
    const parsed = marketplaceMembershipSettingsSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Controlla i valori inseriti." }, { status: 422 });
    const settings = parsed.data;
    if (settings.paidAccessEnabled && !MARKETPLACE_MEMBERSHIP_ROLLOUT_READY) {
      throw new AdminApiError(409, "L'attivazione a pagamento non e ancora disponibile.");
    }
    const previous = await fetchMarketplaceMembershipSettings(supabase);
    if (!previous.storageReady) throw new AdminApiError(409, "Configurazione Marketplace non disponibile.");
    const { error } = await supabase.from("settings").update({
      value: settings, updated_by: profile.id,
    }).eq("key", MARKETPLACE_MEMBERSHIP_SETTINGS_KEY);
    if (error) throw error;
    await writeAdminAuditLog({ supabase, request, actorProfileId: profile.id, isSuperAdmin,
      entityType: "marketplace_membership_settings", action: "settings.marketplace_membership_updated",
      before: previous.settings, after: settings });
    return NextResponse.json({ settings, storageReady: true,
      activationAvailable: MARKETPLACE_MEMBERSHIP_ROLLOUT_READY });
  } catch (error) { return adminApiErrorResponse(error); }
}
