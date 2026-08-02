import { NextResponse, type NextRequest } from "next/server";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ subscriptionId: string }> },
) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const { subscriptionId } = await context.params;

    const { data: subscription, error: subscriptionError } = await supabase
      .from("addon_subscriptions")
      .select(
        "id,addon_product_id,profile_id,status,source,stripe_customer_id,stripe_subscription_id,stripe_price_id,trial_started_at,trial_ends_at,current_period_started_at,current_period_ends_at,cancel_at_period_end,canceled_at,access_expires_at,manual_reason,created_at,updated_at",
      )
      .eq("id", subscriptionId)
      .single();

    if (subscriptionError || !subscription) {
      return NextResponse.json(
        { error: "Abbonamento Marketing non trovato." },
        { status: 404 },
      );
    }

    const [profileResult, managerResult, productResult, paymentsResult] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("id,email,first_name,last_name,phone,status,created_at")
          .eq("id", subscription.profile_id)
          .single(),
        supabase
          .from("property_manager_profiles")
          .select("id,profile_id,company_name")
          .eq("profile_id", subscription.profile_id)
          .maybeSingle(),
        supabase
          .from("addon_products")
          .select("id,name,sale_price_cents,currency,billing_interval,billing_interval_count")
          .eq("id", subscription.addon_product_id)
          .single(),
        supabase
          .from("addon_payments")
          .select(
            "id,payment_kind,provider,provider_invoice_id,provider_payment_intent_id,amount_cents,currency,status,billing_period_started_at,billing_period_ends_at,paid_at,metadata,created_at",
          )
          .eq("subscription_id", subscription.id)
          .order("created_at", { ascending: false }),
      ]);

    if (profileResult.error) throw profileResult.error;
    if (managerResult.error) throw managerResult.error;
    if (productResult.error) throw productResult.error;
    if (paymentsResult.error) throw paymentsResult.error;

    const profile = profileResult.data;
    const manager = managerResult.data;
    const product = productResult.data;
    const payments = paymentsResult.data ?? [];
    const paidPayments = payments.filter((payment) => payment.status === "paid");
    const hasNextCharge =
      subscription.source === "stripe" &&
      !subscription.cancel_at_period_end &&
      ["trialing", "active", "past_due"].includes(subscription.status);

    return NextResponse.json(
      {
        customer: {
          profileId: profile.id,
          name:
            [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
            manager?.company_name ||
            "Property Manager",
          companyName: manager?.company_name ?? null,
          email: profile.email,
          phone: profile.phone,
          accountStatus: profile.status,
          registeredAt: profile.created_at,
        },
        product: {
          name: product.name,
          salePriceCents: product.sale_price_cents,
          currency: product.currency,
          billingInterval: product.billing_interval,
          billingIntervalCount: product.billing_interval_count,
        },
        subscription: {
          id: subscription.id,
          status: subscription.status,
          source: subscription.source,
          stripeCustomerId: subscription.stripe_customer_id,
          stripeSubscriptionId: subscription.stripe_subscription_id,
          stripePriceId: subscription.stripe_price_id,
          trialStartedAt: subscription.trial_started_at,
          trialEndsAt: subscription.trial_ends_at,
          currentPeriodStartedAt: subscription.current_period_started_at,
          currentPeriodEndsAt: subscription.current_period_ends_at,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          canceledAt: subscription.canceled_at,
          accessExpiresAt: subscription.access_expires_at,
          manualReason: subscription.manual_reason,
          createdAt: subscription.created_at,
          updatedAt: subscription.updated_at,
          nextChargeAt: hasNextCharge
            ? subscription.status === "trialing"
              ? subscription.trial_ends_at
              : subscription.current_period_ends_at
            : null,
          nextChargeCents: hasNextCharge ? product.sale_price_cents : null,
        },
        summary: {
          paymentCount: paidPayments.length,
          totalPaidCents: paidPayments.reduce(
            (total, payment) => total + payment.amount_cents,
            0,
          ),
        },
        payments: payments.map((payment) => ({
          id: payment.id,
          paymentKind: payment.payment_kind,
          provider: payment.provider,
          providerInvoiceId: payment.provider_invoice_id,
          providerPaymentIntentId: payment.provider_payment_intent_id,
          amountCents: payment.amount_cents,
          currency: payment.currency,
          status: payment.status,
          billingPeriodStartedAt: payment.billing_period_started_at,
          billingPeriodEndsAt: payment.billing_period_ends_at,
          paidAt: payment.paid_at,
          createdAt: payment.created_at,
          invoiceNumber: readMetadataString(
            payment.metadata,
            "stripe_invoice_number",
          ),
          hostedInvoiceUrl: readMetadataString(
            payment.metadata,
            "hosted_invoice_url",
          ),
          invoicePdfUrl: readMetadataString(payment.metadata, "invoice_pdf"),
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

function readMetadataString(value: unknown, key: string) {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
}
