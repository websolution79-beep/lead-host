import { after, NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { getEnv } from "@/lib/env";
import { sendWalletTopUpEmail } from "@/lib/email/notifications";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { queuePurchaseTrackingEvent } from "@/lib/tracking/server-events";
import { runBrevoWorkerSafely } from "@/lib/brevo/worker";
import { generateWalletTopUpInvoiceSafely } from "@/lib/billing/invoices";
import { cancelWalletTopUpCouponReservation } from "@/lib/wallet/coupons";
import {
  getInvoiceSubscriptionId,
  syncAddonInvoiceFromStripe,
  syncAddonSubscriptionFromStripe,
} from "@/lib/addons/stripe-subscriptions";

type TopUpCompletionResult = {
  wallet_id: string;
  profile_id: string;
  wallet_transaction_id: string;
  amount_cents: number;
  balance_cents: number;
  payment_id: string | null;
  bonus_amount_cents: number;
  coupon_code: string | null;
  bonus_wallet_transaction_id: string | null;
};

type TopUpRpcClient = {
  rpc: (
    fn: "complete_wallet_top_up",
    args: {
      p_wallet_transaction_id: string;
      p_provider_payment_id: string;
      p_provider_checkout_session_id: string;
      p_amount_cents: number;
      p_currency: string;
      p_raw_event: Json;
    },
  ) => {
    single: () => Promise<{
      data: TopUpCompletionResult | null;
      error: { message?: string } | null;
    }>;
  };
};

type FailTopUpRpcClient = {
  rpc: (
    fn: "fail_wallet_top_up",
    args: {
      p_wallet_transaction_id: string;
      p_provider_checkout_session_id: string;
      p_status: "failed" | "cancelled";
      p_raw_event: Json;
    },
  ) => Promise<{ error: { message?: string } | null }>;
};

type ProfileRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
};

export async function POST(request: NextRequest) {
  const stripeSecretKey = getEnv("STRIPE_SECRET_KEY");
  const webhookSecret = getEnv("STRIPE_WEBHOOK_SECRET");

  if (!stripeSecretKey || !webhookSecret) {
    return NextResponse.json(
      { error: "Stripe webhook non configurato." },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Firma Stripe mancante." }, { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = new Stripe(stripeSecretKey);
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Firma Stripe non valida.";

    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.kind === "addon_subscription") {
        const result = await completeAddonSubscription(stripe, session);
        return NextResponse.json({ received: true, result });
      }

      const result = await completeWalletTopUp(session, event);
      const trackingResult =
        "ignored" in result
          ? null
          : await trackWalletTopUpPurchase({
              result,
              session,
              event,
            });
      const emailResult =
        "ignored" in result ? null : await notifyWalletTopUp(result);

      if (!("ignored" in result)) {
        after(async () => {
          await Promise.allSettled([
            runBrevoWorkerSafely(10),
            generateWalletTopUpInvoiceSafely(
              result.wallet_transaction_id,
            ),
          ]);
        });
      }

      return NextResponse.json({
        received: true,
        result,
        email: emailResult,
        tracking: trackingResult,
      });
    }

    if (
      event.type === "checkout.session.expired" ||
      event.type === "checkout.session.async_payment_failed"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.kind === "addon_subscription") {
        await expireAddonCheckout(session);
        return NextResponse.json({ received: true });
      }
      await failWalletTopUp(
        session,
        event,
        event.type === "checkout.session.expired" ? "cancelled" : "failed",
      );
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted" ||
      event.type === "customer.subscription.paused" ||
      event.type === "customer.subscription.resumed"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      const result = await syncAddonSubscriptionFromStripe(subscription, {
        reason: `Webhook Stripe: ${event.type}`,
      });
      return NextResponse.json({ received: true, result });
    }

    if (
      event.type === "invoice.paid" ||
      event.type === "invoice.payment_failed" ||
      event.type === "invoice.payment_action_required" ||
      event.type === "invoice.voided" ||
      event.type === "invoice.marked_uncollectible"
    ) {
      const eventInvoice = event.data.object as Stripe.Invoice;
      if (!eventInvoice.id) return NextResponse.json({ received: true });

      const invoice = await stripe.invoices.retrieve(eventInvoice.id, {
        expand: ["payments.data.payment.payment_intent"],
      });
      const paymentStatus = event.type === "invoice.paid"
        ? "paid"
        : event.type === "invoice.payment_action_required"
          ? "pending"
        : event.type === "invoice.voided"
          ? "void"
          : event.type === "invoice.marked_uncollectible"
            ? "uncollectible"
            : "failed";
      const result = await syncAddonInvoiceFromStripe(invoice, paymentStatus);

      if (!result.ignored) {
        const stripeSubscriptionId = getInvoiceSubscriptionId(invoice);
        if (stripeSubscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
          await syncAddonSubscriptionFromStripe(subscription, {
            reason: `Webhook Stripe: ${event.type}`,
          });
        }
      }

      return NextResponse.json({ received: true, result });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook handling failed:", error);

    return NextResponse.json(
      { error: "Errore gestione webhook Stripe." },
      { status: 500 },
    );
  }
}

async function completeWalletTopUp(
  session: Stripe.Checkout.Session,
  event: Stripe.Event,
) {
  if (session.metadata?.kind !== "wallet_top_up") {
    return { ignored: true, reason: "not_wallet_top_up" };
  }

  if (session.payment_status !== "paid") {
    return { ignored: true, reason: "payment_not_paid" };
  }

  const walletTransactionId = session.metadata.wallet_transaction_id;
  const amountCents = session.amount_total ?? 0;
  const currency = session.currency ?? "eur";
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : "";

  if (!walletTransactionId || amountCents <= 0) {
    throw new Error("Dati ricarica wallet mancanti nel checkout Stripe.");
  }

  const supabase = createServiceSupabaseClient() as unknown as TopUpRpcClient;
  const { data, error } = await supabase
    .rpc("complete_wallet_top_up", {
      p_wallet_transaction_id: walletTransactionId,
      p_provider_payment_id: paymentIntentId,
      p_provider_checkout_session_id: session.id,
      p_amount_cents: amountCents,
      p_currency: currency,
      p_raw_event: event as unknown as Json,
    })
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Ricarica wallet non completata.");
  }

  return data;
}

async function notifyWalletTopUp(result: TopUpCompletionResult) {
  const supabase = createServiceSupabaseClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id,email,first_name,last_name,status")
    .eq("id", result.profile_id)
    .single();

  if (error || !profile || profile.status !== "active") {
    console.warn("Wallet top-up email profile not found:", error?.message ?? result.profile_id);
    return { status: "skipped" as const, reason: "profile_not_found" as const };
  }

  return sendWalletTopUpEmail({
    profile: profile as ProfileRow,
    walletTransactionId: result.wallet_transaction_id,
    amountCents: result.amount_cents,
    balanceCents: result.balance_cents,
    bonusAmountCents: result.bonus_amount_cents,
    couponCode: result.coupon_code,
  });
}

async function trackWalletTopUpPurchase({
  result,
  session,
  event,
}: {
  result: TopUpCompletionResult;
  session: Stripe.Checkout.Session;
  event: Stripe.Event;
}) {
  try {
    const supabase = createServiceSupabaseClient();

    return await queuePurchaseTrackingEvent({
      supabase,
      input: {
        profileId: result.profile_id,
        walletTransactionId: result.wallet_transaction_id,
        paymentId: result.payment_id,
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : null,
        valueCents: result.amount_cents,
        currency: session.currency ?? "eur",
        occurredAt: new Date(event.created * 1000).toISOString(),
        consent: {
          resolved:
            session.metadata?.tracking_consent_resolved === "true",
          measurement:
            session.metadata?.tracking_measurement_consent === "true",
          marketing:
            session.metadata?.tracking_marketing_consent === "true",
        },
        gaClientId:
          session.metadata?.tracking_measurement_consent === "true"
            ? session.metadata?.ga_client_id ?? null
            : null,
      },
    });
  } catch (error) {
    console.error("Purchase tracking queue failed:", error);

    return {
      status: "failed" as const,
      reason: "tracking_queue_failed",
    };
  }
}

async function failWalletTopUp(
  session: Stripe.Checkout.Session,
  event: Stripe.Event,
  status: "failed" | "cancelled",
) {
  if (session.metadata?.kind !== "wallet_top_up") {
    return;
  }

  const walletTransactionId = session.metadata.wallet_transaction_id;

  if (!walletTransactionId) {
    return;
  }

  const serviceSupabase = createServiceSupabaseClient();
  const supabase = serviceSupabase as unknown as FailTopUpRpcClient;
  const { error } = await supabase.rpc("fail_wallet_top_up", {
    p_wallet_transaction_id: walletTransactionId,
    p_provider_checkout_session_id: session.id,
    p_status: status,
    p_raw_event: event as unknown as Json,
  });

  if (error) {
    throw new Error(error.message ?? "Ricarica wallet non aggiornata.");
  }

  await cancelWalletTopUpCouponReservation({
    supabase: serviceSupabase,
    walletTransactionId,
    reason: `stripe_checkout_${status}`,
  }).catch((couponError) => {
    console.warn("Coupon reservation cancellation failed:", couponError);
  });
}

async function completeAddonSubscription(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
) {
  const localSubscriptionId = session.metadata?.addon_subscription_id;
  const stripeSubscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!localSubscriptionId || !stripeSubscriptionId) {
    throw new Error("Riferimenti abbonamento Addon mancanti nel checkout Stripe.");
  }

  const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const result = await syncAddonSubscriptionFromStripe(stripeSubscription, {
    reason: "Stripe Checkout completato",
    checkoutSessionId: session.id,
  });
  if (result.ignored) {
    throw new Error(`Abbonamento Addon non sincronizzato: ${result.reason}`);
  }

  return { status: result.status, subscriptionId: result.id };
}

async function expireAddonCheckout(session: Stripe.Checkout.Session) {
  const subscriptionId = session.metadata?.addon_subscription_id;
  if (!subscriptionId) return;

  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from("addon_subscriptions")
    .update({
      status: "expired",
      canceled_at: new Date().toISOString(),
      metadata: { stripe_checkout_session_id: session.id, checkout_status: session.status },
    })
    .eq("id", subscriptionId)
    .eq("status", "incomplete");
  if (error) throw error;
}
