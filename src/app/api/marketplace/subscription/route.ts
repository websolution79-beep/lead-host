import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { PropertyManagerApiError, propertyManagerApiErrorResponse, requirePropertyManager } from "@/lib/api/property-manager-auth";
import { syncAddonSubscriptionFromStripe } from "@/lib/addons/stripe-subscriptions";
import { getEnv } from "@/lib/env";
import { loadMarketplaceSubscription } from "@/lib/marketplace-membership/subscription";

export async function GET(request: NextRequest) {
  try {
    const { supabase, profile } = await requirePropertyManager(request);
    const { subscription: s } = await loadMarketplaceSubscription(supabase, profile.id);
    const meta = s?.metadata && typeof s.metadata === "object" && !Array.isArray(s.metadata) ? s.metadata : {};
    return NextResponse.json({ subscription: s ? {
      status: s.status, cancelAtPeriodEnd: s.cancel_at_period_end,
      periodEndsAt: s.status === "trialing" ? s.trial_ends_at : s.current_period_ends_at,
      monthlyPriceCents: typeof meta.monthly_price_cents === "number" ? meta.monthly_price_cents : null,
      canCancel: s.source === "stripe" && !!s.stripe_subscription_id && !s.cancel_at_period_end,
    } : null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return propertyManagerApiErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile } = await requirePropertyManager(request);
    if (!z.object({ action: z.literal("cancel") }).safeParse(await request.json().catch(() => null)).success) {
      throw new PropertyManagerApiError(422, "Operazione non valida.");
    }
    const { subscription } = await loadMarketplaceSubscription(supabase, profile.id);
    if (!subscription?.stripe_subscription_id || subscription.source !== "stripe") {
      throw new PropertyManagerApiError(409, "Nessun abbonamento Marketplace da disdire.");
    }
    const key = getEnv("STRIPE_SECRET_KEY");
    if (!key) throw new PropertyManagerApiError(503, "Stripe non configurato.");
    const stripe = new Stripe(key);
    const current = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
    if (current.metadata.addon_slug !== "marketplace" || current.metadata.profile_id !== profile.id ||
      current.metadata.addon_subscription_id !== subscription.id) {
      throw new PropertyManagerApiError(409, "Abbonamento non coerente. Contatta l'assistenza.");
    }
    const updated = current.status === "canceled" || current.status === "incomplete_expired" || current.cancel_at_period_end
      ? current
      : await stripe.subscriptions.update(current.id, { cancel_at_period_end: true });
    await syncAddonSubscriptionFromStripe(updated, { reason: "Disdetta Marketplace richiesta dal Property Manager" });
    return NextResponse.json({ ok: true,
      message: "Rinnovi disattivati. L'accesso resta disponibile fino alla scadenza del periodo corrente." });
  } catch (error) { return propertyManagerApiErrorResponse(error); }
}
