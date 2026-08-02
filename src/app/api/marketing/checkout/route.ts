import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import {
  propertyManagerApiErrorResponse,
  requirePropertyManager,
} from "@/lib/api/property-manager-auth";
import { getBillingReadiness } from "@/lib/billing/server";
import { getEnv, getRequestAppUrl } from "@/lib/env";
import { CURRENT_TERMS_VERSION } from "@/lib/legal/terms";
import type { Json } from "@/lib/supabase/database.types";

const checkoutSchema = z.object({ termsAccepted: z.literal(true) });
const blockingStatuses = [
  "incomplete",
  "trialing",
  "active",
  "past_due",
  "paused",
  "unpaid",
] as const;

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile } = await requirePropertyManager(request);
    const parsed = checkoutSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Devi accettare i Termini e Condizioni per iniziare la prova.", code: "TERMS_REQUIRED" },
        { status: 422 },
      );
    }

    const stripeKey = getEnv("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return NextResponse.json(
        { error: "Stripe non configurato.", code: "STRIPE_NOT_CONFIGURED" },
        { status: 503 },
      );
    }

    const { data: product, error: productError } = await supabase
      .from("addon_products")
      .select("id,name,status,checkout_enabled,trial_days,sale_price_cents,currency,stripe_product_id,stripe_price_id,terms_url")
      .eq("slug", "marketing")
      .single();

    if (productError || !product) throw productError;
    if (
      product.status !== "active" ||
      !product.checkout_enabled ||
      !product.sale_price_cents ||
      !product.stripe_product_id ||
      !product.stripe_price_id
    ) {
      return NextResponse.json(
        { error: "L’attivazione del Modulo Marketing non è ancora disponibile.", code: "CHECKOUT_DISABLED" },
        { status: 409 },
      );
    }

    const billing = await getBillingReadiness(supabase, profile.id);
    if (!billing.complete) {
      return NextResponse.json(
        {
          error: "Completa i dati di fatturazione nel profilo prima di iniziare la prova.",
          code: "BILLING_PROFILE_INCOMPLETE",
          missingLabels: billing.missingLabels,
        },
        { status: 422 },
      );
    }

    const stripe = new Stripe(stripeKey);
    const { data: current } = await supabase
      .from("addon_subscriptions")
      .select("id,status,source,stripe_customer_id,metadata,updated_at")
      .eq("addon_product_id", product.id)
      .eq("profile_id", profile.id)
      .in("status", [...blockingStatuses])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (current?.status === "incomplete" && current.source === "stripe") {
      const existingUrl = await resolveOpenCheckoutUrl(stripe, current.metadata);
      if (existingUrl) {
        return NextResponse.json({ ok: true, checkoutUrl: existingUrl, reused: true });
      }
      await supabase
        .from("addon_subscriptions")
        .update({ status: "expired", canceled_at: new Date().toISOString() })
        .eq("id", current.id)
        .eq("status", "incomplete");
    } else if (current) {
      return NextResponse.json(
        {
          error: current.source === "manual"
            ? "Il Modulo Marketing è già attivo sul tuo account."
            : "Hai già una prova o un abbonamento per il Modulo Marketing.",
          code: "SUBSCRIPTION_ALREADY_EXISTS",
        },
        { status: 409 },
      );
    }

    const { data: trialUsage, error: trialError } = await supabase
      .from("addon_trial_usage")
      .select("id")
      .eq("addon_product_id", product.id)
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (trialError) throw trialError;
    const trialDays = trialUsage ? 0 : product.trial_days;

    const { data: previousStripeAccess } = await supabase
      .from("addon_subscriptions")
      .select("stripe_customer_id")
      .eq("addon_product_id", product.id)
      .eq("profile_id", profile.id)
      .eq("source", "stripe")
      .not("stripe_customer_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: pending, error: pendingError } = await supabase
      .from("addon_subscriptions")
      .insert({
        addon_product_id: product.id,
        profile_id: profile.id,
        status: "incomplete",
        source: "stripe",
        stripe_customer_id: previousStripeAccess?.stripe_customer_id ?? null,
        stripe_price_id: product.stripe_price_id,
        metadata: {
          terms_version: CURRENT_TERMS_VERSION,
          terms_accepted_at: new Date().toISOString(),
          trial_days_requested: trialDays,
        },
      })
      .select("id,stripe_customer_id")
      .single();

    if (pendingError || !pending) {
      if (pendingError?.code === "23505") {
        return NextResponse.json(
          { error: "Esiste già un’attivazione in corso. Aggiorna la pagina.", code: "CHECKOUT_IN_PROGRESS" },
          { status: 409 },
        );
      }
      throw pendingError;
    }

    try {
      const customerId = pending.stripe_customer_id || await createStripeCustomer(stripe, profile);
      const appUrl = getRequestAppUrl(request);
      const metadata = {
        kind: "addon_subscription",
        addon_slug: "marketing",
        addon_product_id: product.id,
        addon_subscription_id: pending.id,
        profile_id: profile.id,
        terms_version: CURRENT_TERMS_VERSION,
      };
      const session = await stripe.checkout.sessions.create(
        {
          mode: "subscription",
          customer: customerId,
          client_reference_id: pending.id,
          success_url: `${appUrl}/app/marketing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appUrl}/app/marketing?checkout=cancelled`,
          locale: "it",
          metadata,
          subscription_data: {
            metadata,
            ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
          },
          line_items: [{ price: product.stripe_price_id, quantity: 1 }],
        },
        { idempotencyKey: `addon-checkout-${pending.id}` },
      );

      if (!session.url) throw new Error("Checkout Stripe senza URL.");

      await supabase
        .from("addon_subscriptions")
        .update({
          stripe_customer_id: customerId,
          metadata: {
            terms_version: CURRENT_TERMS_VERSION,
            terms_accepted_at: new Date().toISOString(),
            trial_days_requested: trialDays,
            stripe_checkout_session_id: session.id,
            stripe_checkout_expires_at: new Date(session.expires_at * 1000).toISOString(),
          },
        })
        .eq("id", pending.id);

      return NextResponse.json({ ok: true, checkoutUrl: session.url, reused: false });
    } catch (error) {
      await supabase
        .from("addon_subscriptions")
        .update({
          status: "expired",
          canceled_at: new Date().toISOString(),
          metadata: { checkout_error: error instanceof Error ? error.message.slice(0, 500) : "unknown" },
        })
        .eq("id", pending.id);
      throw error;
    }
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}

async function resolveOpenCheckoutUrl(stripe: Stripe, metadata: Json) {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") return null;
  const sessionId = typeof metadata.stripe_checkout_session_id === "string"
    ? metadata.stripe_checkout_session_id
    : null;
  if (!sessionId) return null;

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return session.status === "open" ? session.url : null;
  } catch {
    return null;
  }
}

async function createStripeCustomer(
  stripe: Stripe,
  profile: { id: string; email: string; first_name: string | null; last_name: string | null },
) {
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
  const customer = await stripe.customers.create(
    {
      email: profile.email,
      ...(name ? { name } : {}),
      metadata: { leadhost_profile_id: profile.id },
    },
    { idempotencyKey: `leadhost-customer-${profile.id}` },
  );
  return customer.id;
}
