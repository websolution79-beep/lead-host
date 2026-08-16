import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import {
  PropertyManagerApiError,
  propertyManagerApiErrorResponse,
  requirePropertyManager,
} from "@/lib/api/property-manager-auth";
import { syncAddonSubscriptionFromStripe } from "@/lib/addons/stripe-subscriptions";
import { getOrCreateStripePortalConfiguration } from "@/lib/addons/stripe-infrastructure";
import { getEnv, getRequestAppUrl } from "@/lib/env";
import { syncPrimeAccountFromStripeSubscription } from "@/lib/prime/billing";

const actionSchema = z.object({ action: z.enum(["portal", "cancel", "resume"]) });
const currentStatuses = ["incomplete", "trialing", "active", "past_due", "paused", "unpaid"] as const;

export async function GET(request: NextRequest) {
  try {
    const { supabase, profile } = await requirePropertyManager(request);
    return NextResponse.json({ ok: true, ...(await loadState(supabase, profile.id)) });
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile } = await requirePropertyManager(request);
    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new PropertyManagerApiError(422, "Operazione PRIME non valida.");

    const stripeKey = getEnv("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new PropertyManagerApiError(503, "Stripe non configurato.");
    const state = await loadState(supabase, profile.id);
    const subscription = state.subscription;
    if (!subscription) throw new PropertyManagerApiError(404, "Nessun abbonamento PRIME trovato.");
    if (subscription.source !== "stripe" || !subscription.stripeSubscriptionId) {
      throw new PropertyManagerApiError(409, "Questo accesso PRIME è gestito dal team Lead Host.");
    }

    const stripe = new Stripe(stripeKey);
    if (parsed.data.action === "portal") {
      if (!subscription.stripeCustomerId) {
        throw new PropertyManagerApiError(409, "Cliente Stripe non associato.");
      }
      const appUrl = getRequestAppUrl(request);
      const configuration = await getOrCreateStripePortalConfiguration(stripe, appUrl);
      const portal = await stripe.billingPortal.sessions.create({
        customer: subscription.stripeCustomerId,
        configuration,
        return_url: `${appUrl}/app/prime`,
      });
      return NextResponse.json({ ok: true, portalUrl: portal.url });
    }

    if (parsed.data.action === "resume") {
      if (!subscription.cancelAtPeriodEnd) {
        throw new PropertyManagerApiError(409, "La cancellazione non è programmata.");
      }
      const updated = await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });
      await Promise.all([
        syncAddonSubscriptionFromStripe(updated, { reason: "Rinnovo PRIME ripristinato dal PM" }),
        syncPrimeAccountFromStripeSubscription(updated),
      ]);
      return NextResponse.json({ ok: true, message: "Rinnovo PRIME ripristinato." });
    }

    if (subscription.cancelAtPeriodEnd) {
      throw new PropertyManagerApiError(409, "La cancellazione è già programmata.");
    }
    const updated = await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    await Promise.all([
      syncAddonSubscriptionFromStripe(updated, { reason: "Cancellazione PRIME richiesta dal PM" }),
      syncPrimeAccountFromStripeSubscription(updated),
    ]);
    return NextResponse.json({
      ok: true,
      message: "Il rinnovo è stato annullato. PRIME resterà attivo fino alla fine del periodo pagato.",
    });
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}

async function loadState(
  supabase: Awaited<ReturnType<typeof requirePropertyManager>>["supabase"],
  profileId: string,
) {
  const { data: product, error: productError } = await supabase
    .from("addon_products")
    .select("id,name")
    .eq("slug", "lead-host-prime")
    .single();
  if (productError || !product) throw productError;

  const { data: subscription, error } = await supabase
    .from("addon_subscriptions")
    .select("id,status,source,stripe_customer_id,stripe_subscription_id,current_period_ends_at,cancel_at_period_end,canceled_at")
    .eq("addon_product_id", product.id)
    .eq("profile_id", profileId)
    .in("status", [...currentStatuses])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  return {
    product: { name: product.name },
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          source: subscription.source,
          stripeCustomerId: subscription.stripe_customer_id,
          stripeSubscriptionId: subscription.stripe_subscription_id,
          currentPeriodEndsAt: subscription.current_period_ends_at,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          canceledAt: subscription.canceled_at,
        }
      : null,
  };
}
