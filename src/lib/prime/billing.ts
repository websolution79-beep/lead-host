import Stripe from "stripe";
import { getInvoiceSubscriptionId, toIsoDate } from "@/lib/addons/stripe-subscriptions";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

type PrimeInvoiceStatus = "paid" | "failed" | "void" | "uncollectible";

type PrimeCompletionResult = {
  prime_billing_period_id: string;
  wallet_transaction_id: string | null;
  profile_id: string;
  membership_amount_cents: number;
  wallet_recharge_amount_cents: number;
  total_amount_cents: number;
  balance_cents: number;
  already_completed: boolean;
};

type PrimeRpcClient = {
  rpc: (
    fn: "complete_prime_billing_period",
    args: Record<string, unknown>,
  ) => {
    single: () => Promise<{
      data: PrimeCompletionResult | null;
      error: { message?: string } | null;
    }>;
  };
};

type PrimeFailureRpcClient = {
  rpc: (
    fn: "fail_prime_billing_period",
    args: Record<string, unknown>,
  ) => Promise<{ error: { message?: string } | null }>;
};

export async function syncPrimeInvoiceFromStripe(
  invoice: Stripe.Invoice,
  status: PrimeInvoiceStatus,
) {
  const stripeSubscriptionId = getInvoiceSubscriptionId(invoice);
  if (!stripeSubscriptionId || !invoice.id) {
    return { ignored: true as const, reason: "invoice_without_subscription" };
  }

  const metadata = invoice.parent?.subscription_details?.metadata;
  if (metadata?.kind !== "prime_subscription") {
    return { ignored: true as const, reason: "not_prime_invoice" };
  }

  const addonSubscriptionId = metadata.addon_subscription_id;
  const primeAccountId = metadata.prime_account_id;
  const profileId = metadata.profile_id;
  if (!addonSubscriptionId || !primeAccountId || !profileId) {
    throw new Error("Metadati fattura PRIME incompleti.");
  }

  const firstMonthServiceFeeCents = parsePositiveCents(
    metadata.prime_first_month_service_fee_cents,
    "first_month_service_fee",
  );
  const recurringServiceFeeCents = parsePositiveCents(
    metadata.prime_recurring_service_fee_cents,
    "recurring_service_fee",
  );
  const walletRechargeCents = parsePositiveCents(
    metadata.prime_wallet_recharge_cents,
    "wallet_recharge",
  );
  const periodKind: "initial" | "renewal" =
    invoice.billing_reason === "subscription_create" ? "initial" : "renewal";
  const membershipAmountCents = periodKind === "initial"
    ? firstMonthServiceFeeCents
    : recurringServiceFeeCents;
  const expectedTotalCents = membershipAmountCents + walletRechargeCents;
  const invoiceTotalCents = status === "paid" ? invoice.amount_paid : invoice.amount_due;

  if (invoiceTotalCents !== expectedTotalCents) {
    throw new Error(
      `Totale fattura PRIME non coerente: atteso ${expectedTotalCents}, ricevuto ${invoiceTotalCents}.`,
    );
  }

  const periodStartedAt = toIsoDate(invoice.period_start);
  const periodEndsAt = toIsoDate(invoice.period_end);
  const commonMetadata = {
    stripe_invoice_number: invoice.number,
    hosted_invoice_url: invoice.hosted_invoice_url ?? null,
    invoice_pdf: invoice.invoice_pdf ?? null,
    billing_reason: invoice.billing_reason,
  } as Json;

  if (status === "paid") {
    const supabase = createServiceSupabaseClient() as unknown as PrimeRpcClient;
    const { data, error } = await supabase
      .rpc("complete_prime_billing_period", {
        p_prime_account_id: primeAccountId,
        p_addon_subscription_id: addonSubscriptionId,
        p_profile_id: profileId,
        p_provider_invoice_id: invoice.id,
        p_provider_payment_intent_id: getInvoicePaymentIntentId(invoice) ?? "",
        p_provider_checkout_session_id: "",
        p_provider_subscription_id: stripeSubscriptionId,
        p_period_kind: periodKind,
        p_membership_amount_cents: membershipAmountCents,
        p_wallet_recharge_amount_cents: walletRechargeCents,
        p_total_amount_cents: expectedTotalCents,
        p_currency: invoice.currency,
        p_billing_period_started_at: periodStartedAt,
        p_billing_period_ends_at: periodEndsAt,
        p_metadata: commonMetadata,
      })
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? "Fattura PRIME non contabilizzata.");
    }
    return { ignored: false as const, status, periodKind, ...data };
  }

  const supabase = createServiceSupabaseClient() as unknown as PrimeFailureRpcClient;
  const { error } = await supabase.rpc("fail_prime_billing_period", {
    p_prime_account_id: primeAccountId,
    p_addon_subscription_id: addonSubscriptionId,
    p_profile_id: profileId,
    p_provider_invoice_id: invoice.id,
    p_provider_subscription_id: stripeSubscriptionId,
    p_status: status,
    p_membership_amount_cents: membershipAmountCents,
    p_wallet_recharge_amount_cents: walletRechargeCents,
    p_total_amount_cents: expectedTotalCents,
    p_currency: invoice.currency,
    p_billing_period_started_at: periodStartedAt,
    p_billing_period_ends_at: periodEndsAt,
    p_metadata: commonMetadata,
  });
  if (error) throw new Error(error.message ?? "Insoluto PRIME non registrato.");
  return { ignored: false as const, status, periodKind, profile_id: profileId };
}

export async function syncPrimeAccountFromStripeSubscription(
  subscription: Stripe.Subscription,
) {
  if (subscription.metadata.kind !== "prime_subscription") {
    return { ignored: true as const, reason: "not_prime_subscription" };
  }

  const primeAccountId = subscription.metadata.prime_account_id;
  const addonSubscriptionId = subscription.metadata.addon_subscription_id;
  const profileId = subscription.metadata.profile_id;
  if (!primeAccountId || !addonSubscriptionId || !profileId) {
    throw new Error("Metadati abbonamento PRIME incompleti.");
  }

  const subscriptionItem = subscription.items.data[0];
  const periodEndsAt = toIsoDate(subscriptionItem?.current_period_end ?? null);
  const supabase = createServiceSupabaseClient();

  if (subscription.status === "canceled") {
    const { error } = await supabase
      .from("prime_accounts")
      .update({
        status: "cancelled",
        payment_status: "cancelled",
        prime_expires_at: periodEndsAt ?? new Date().toISOString(),
        grace_ends_at: null,
      })
      .eq("id", primeAccountId)
      .eq("profile_id", profileId);
    if (error) throw error;
  } else if (subscription.status === "unpaid") {
    const { error } = await supabase
      .from("prime_accounts")
      .update({ status: "past_due", payment_status: "unpaid" })
      .eq("id", primeAccountId)
      .eq("profile_id", profileId);
    if (error) throw error;
  }

  return {
    ignored: false as const,
    primeAccountId,
    addonSubscriptionId,
    profileId,
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    periodEndsAt,
  };
}

function parsePositiveCents(value: string | undefined, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Importo PRIME non valido: ${label}.`);
  }
  return parsed;
}

function getInvoicePaymentIntentId(invoice: Stripe.Invoice) {
  const paymentIntent = invoice.payments?.data.find(
    (payment) => payment.payment.type === "payment_intent",
  )?.payment.payment_intent;
  return typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id ?? null;
}
