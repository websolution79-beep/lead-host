import Stripe from "stripe";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

type AddonSubscriptionStatus =
  | "incomplete"
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "unpaid"
  | "canceled"
  | "expired";

type AddonPaymentStatus =
  | "created"
  | "pending"
  | "paid"
  | "failed"
  | "refunded"
  | "void"
  | "uncollectible";

export async function syncAddonSubscriptionFromStripe(
  subscription: Stripe.Subscription,
  options: { reason: string; checkoutSessionId?: string } = {
    reason: "Aggiornamento Stripe",
  },
) {
  const supabase = createServiceSupabaseClient();
  const localSubscriptionId = subscription.metadata.addon_subscription_id || null;

  let query = supabase
    .from("addon_subscriptions")
    .select("id,addon_product_id,profile_id,status,cancel_at_period_end,metadata")
    .eq("source", "stripe");

  query = localSubscriptionId
    ? query.eq("id", localSubscriptionId)
    : query.eq("stripe_subscription_id", subscription.id);

  const { data: current, error: currentError } = await query.maybeSingle();
  if (currentError) throw currentError;
  if (!current) return { ignored: true as const, reason: "addon_subscription_not_found" };

  const status = mapStripeSubscriptionStatus(subscription.status);
  const subscriptionItem = subscription.items.data[0];
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;
  const metadata = {
    ...toJsonRecord(current.metadata),
    stripe_subscription_status: subscription.status,
    ...(options.checkoutSessionId
      ? { stripe_checkout_session_id: options.checkoutSessionId }
      : {}),
  };

  const { error: updateError } = await supabase
    .from("addon_subscriptions")
    .update({
      status,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      stripe_price_id: subscriptionItem?.price.id ?? null,
      trial_started_at: toIsoDate(subscription.trial_start),
      trial_ends_at: toIsoDate(subscription.trial_end),
      current_period_started_at: toIsoDate(subscriptionItem?.current_period_start ?? null),
      current_period_ends_at: toIsoDate(subscriptionItem?.current_period_end ?? null),
      cancel_at_period_end: subscription.cancel_at_period_end,
      canceled_at: toIsoDate(subscription.canceled_at),
      metadata,
    })
    .eq("id", current.id);
  if (updateError) throw updateError;

  if (subscription.trial_end) {
    const { error: trialError } = await supabase.from("addon_trial_usage").upsert(
      {
        addon_product_id: current.addon_product_id,
        profile_id: current.profile_id,
        subscription_id: current.id,
        source: "stripe",
        used_at: new Date().toISOString(),
      },
      { onConflict: "addon_product_id,profile_id", ignoreDuplicates: true },
    );
    if (trialError) throw trialError;
  }

  const action = resolveAccessAction({
    previousStatus: current.status,
    nextStatus: status,
    previousCancelAtPeriodEnd: current.cancel_at_period_end,
    nextCancelAtPeriodEnd: subscription.cancel_at_period_end,
  });

  if (action) {
    const { error: eventError } = await supabase.from("addon_access_events").insert({
      addon_product_id: current.addon_product_id,
      subscription_id: current.id,
      profile_id: current.profile_id,
      action,
      reason: options.reason,
      metadata: { stripe_subscription_id: subscription.id },
    });
    if (eventError) throw eventError;
  }

  return {
    ignored: false as const,
    id: current.id,
    addonProductId: current.addon_product_id,
    profileId: current.profile_id,
    status,
  };
}

export async function syncAddonInvoiceFromStripe(
  invoice: Stripe.Invoice,
  status: AddonPaymentStatus,
) {
  const stripeSubscriptionId = getInvoiceSubscriptionId(invoice);
  if (!stripeSubscriptionId || !invoice.id) {
    return { ignored: true as const, reason: "invoice_without_subscription" };
  }

  if (invoice.amount_due === 0 && invoice.amount_paid === 0) {
    return { ignored: true as const, reason: "zero_amount_invoice" };
  }

  const supabase = createServiceSupabaseClient();
  const localSubscriptionId = invoice.parent?.subscription_details?.metadata
    ?.addon_subscription_id ?? null;
  let subscriptionQuery = supabase
    .from("addon_subscriptions")
    .select("id,addon_product_id,profile_id");
  subscriptionQuery = localSubscriptionId
    ? subscriptionQuery.eq("id", localSubscriptionId)
    : subscriptionQuery.eq("stripe_subscription_id", stripeSubscriptionId);
  const { data: subscription, error: subscriptionError } = await subscriptionQuery.maybeSingle();
  if (subscriptionError) throw subscriptionError;
  if (!subscription) return { ignored: true as const, reason: "not_addon_invoice" };

  const paymentIntentId = getInvoicePaymentIntentId(invoice);
  const paidAt = status === "paid"
    ? toIsoDate(invoice.status_transitions.paid_at) ?? new Date().toISOString()
    : null;
  const amountCents = status === "paid" ? invoice.amount_paid : invoice.amount_due;
  const paymentKind = invoice.billing_reason === "subscription_create" ? "initial" : "renewal";
  const { error: paymentError } = await supabase.from("addon_payments").upsert(
    {
      addon_product_id: subscription.addon_product_id,
      subscription_id: subscription.id,
      profile_id: subscription.profile_id,
      payment_kind: paymentKind,
      provider: "stripe",
      provider_invoice_id: invoice.id,
      provider_payment_intent_id: paymentIntentId,
      amount_cents: Math.max(0, amountCents),
      currency: invoice.currency,
      status,
      billing_period_started_at: toIsoDate(invoice.period_start),
      billing_period_ends_at: toIsoDate(invoice.period_end),
      paid_at: paidAt,
      metadata: {
        stripe_invoice_number: invoice.number,
        hosted_invoice_url: invoice.hosted_invoice_url ?? null,
        invoice_pdf: invoice.invoice_pdf ?? null,
        billing_reason: invoice.billing_reason,
      },
    },
    { onConflict: "provider,provider_invoice_id" },
  );
  if (paymentError) throw paymentError;

  return {
    ignored: false as const,
    subscriptionId: subscription.id,
    stripeSubscriptionId,
  };
}

export function getInvoiceSubscriptionId(invoice: Stripe.Invoice) {
  const subscription = invoice.parent?.subscription_details?.subscription;
  return typeof subscription === "string" ? subscription : subscription?.id ?? null;
}

function getInvoicePaymentIntentId(invoice: Stripe.Invoice) {
  const paymentIntent = invoice.payments?.data.find(
    (payment) => payment.payment.type === "payment_intent",
  )?.payment.payment_intent;
  return typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id ?? null;
}

function resolveAccessAction({
  previousStatus,
  nextStatus,
  previousCancelAtPeriodEnd,
  nextCancelAtPeriodEnd,
}: {
  previousStatus: string;
  nextStatus: AddonSubscriptionStatus;
  previousCancelAtPeriodEnd: boolean;
  nextCancelAtPeriodEnd: boolean;
}) {
  if (!previousCancelAtPeriodEnd && nextCancelAtPeriodEnd) return "addon.cancellation_scheduled";
  if (previousCancelAtPeriodEnd && !nextCancelAtPeriodEnd) return "addon.cancellation_revoked";
  if (previousStatus === nextStatus) return null;
  if (nextStatus === "trialing") return "addon.trial_started";
  if (nextStatus === "active") return previousStatus === "past_due"
    ? "addon.payment_recovered"
    : "addon.subscription_activated";
  if (nextStatus === "past_due") return "addon.payment_failed";
  if (nextStatus === "canceled") return "addon.subscription_canceled";
  if (nextStatus === "unpaid") return "addon.subscription_unpaid";
  if (nextStatus === "paused") return "addon.subscription_paused";
  return "addon.subscription_updated";
}

export function mapStripeSubscriptionStatus(status: Stripe.Subscription.Status) {
  if (status === "incomplete_expired") return "expired" as const;
  if (status === "canceled") return "canceled" as const;
  return status;
}

export function toIsoDate(value: number | null | undefined) {
  return value ? new Date(value * 1000).toISOString() : null;
}

function toJsonRecord(value: Json) {
  return value && !Array.isArray(value) && typeof value === "object" ? value : {};
}
