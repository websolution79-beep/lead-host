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

const actionSchema = z.object({
  action: z.enum(["portal", "cancel", "resume"]),
});

const currentStatuses = [
  "incomplete",
  "trialing",
  "active",
  "past_due",
  "paused",
  "unpaid",
] as const;

export async function GET(request: NextRequest) {
  try {
    const { supabase, profile } = await requirePropertyManager(request);
    const state = await loadSubscriptionState(supabase, profile.id);
    return NextResponse.json({ ok: true, ...state });
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile } = await requirePropertyManager(request);
    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new PropertyManagerApiError(422, "Operazione abbonamento non valida.");
    }

    const stripeKey = getEnv("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      throw new PropertyManagerApiError(503, "Stripe non configurato.");
    }

    const state = await loadSubscriptionState(supabase, profile.id);
    const subscription = state.subscription;
    if (!subscription) {
      throw new PropertyManagerApiError(404, "Nessun abbonamento Marketing trovato.");
    }
    if (subscription.source !== "stripe" || !subscription.stripeSubscriptionId) {
      throw new PropertyManagerApiError(
        409,
        "Questo accesso è gestito manualmente dal team Lead Host.",
      );
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
        return_url: `${appUrl}/app/profilo#abbonamento-marketing`,
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
      await syncAddonSubscriptionFromStripe(updated, {
        reason: "Cancellazione revocata dal Property Manager",
      });
      return NextResponse.json({ ok: true, message: "Rinnovo dell’abbonamento ripristinato." });
    }

    if (subscription.status === "canceled" || subscription.status === "expired") {
      throw new PropertyManagerApiError(409, "L’abbonamento è già terminato.");
    }

    const updated = state.product.cancellationMode === "immediate"
      ? await stripe.subscriptions.cancel(subscription.stripeSubscriptionId, {
          invoice_now: false,
          prorate: false,
        })
      : await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          cancel_at_period_end: true,
        });

    await syncAddonSubscriptionFromStripe(updated, {
      reason: "Cancellazione richiesta dal Property Manager",
    });

    return NextResponse.json({
      ok: true,
      message: state.product.cancellationMode === "immediate"
        ? "Abbonamento cancellato."
        : "Abbonamento cancellato: resterà attivo fino alla fine del periodo corrente.",
    });
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}

async function loadSubscriptionState(
  supabase: Awaited<ReturnType<typeof requirePropertyManager>>["supabase"],
  profileId: string,
) {
  const { data: product, error: productError } = await supabase
    .from("addon_products")
    .select("id,name,cancellation_mode")
    .eq("slug", "marketing")
    .single();
  if (productError || !product) throw productError;

  const { data: subscription, error: subscriptionError } = await supabase
    .from("addon_subscriptions")
    .select(
      "id,status,source,stripe_customer_id,stripe_subscription_id,trial_ends_at,current_period_ends_at,cancel_at_period_end,canceled_at,created_at,updated_at",
    )
    .eq("addon_product_id", product.id)
    .eq("profile_id", profileId)
    .in("status", [...currentStatuses])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (subscriptionError) throw subscriptionError;

  return {
    product: {
      name: product.name,
      cancellationMode: product.cancellation_mode,
    },
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          source: subscription.source,
          stripeCustomerId: subscription.stripe_customer_id,
          stripeSubscriptionId: subscription.stripe_subscription_id,
          trialEndsAt: subscription.trial_ends_at,
          currentPeriodEndsAt: subscription.current_period_ends_at,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          canceledAt: subscription.canceled_at,
          createdAt: subscription.created_at,
          updatedAt: subscription.updated_at,
        }
      : null,
  };
}
