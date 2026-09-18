import { NextResponse, type NextRequest } from "next/server";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import { subscriptionReportingPrice } from "@/lib/marketplace-membership/reporting";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ subscriptionId: string }> },
) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const { subscriptionId } = await context.params;
    const { data: subscription, error: subscriptionError } = await supabase
      .from("addon_subscriptions")
      .select("id,addon_product_id,profile_id,status,source,trial_started_at,trial_ends_at,current_period_started_at,current_period_ends_at,cancel_at_period_end,canceled_at,access_expires_at,manual_reason,metadata,created_at")
      .eq("id", subscriptionId)
      .single();
    if (subscriptionError || !subscription) {
      return NextResponse.json({ error: "Abbonamento non trovato." }, { status: 404 });
    }

    const [productResult, profileResult, pmResult, paymentsResult] = await Promise.all([
      supabase.from("addon_products").select("slug,name,sale_price_cents,currency").eq("id", subscription.addon_product_id).single(),
      supabase.from("profiles").select("id,email,first_name,last_name,phone,status,created_at").eq("id", subscription.profile_id).single(),
      supabase.from("property_manager_profiles").select("company_name,primary_city").eq("profile_id", subscription.profile_id).maybeSingle(),
      supabase.from("addon_payments").select("id,payment_kind,amount_cents,currency,status,paid_at,billing_period_started_at,billing_period_ends_at,created_at")
        .eq("subscription_id", subscription.id).order("created_at", { ascending: false }),
    ]);
    if (productResult.error) throw productResult.error;
    if (profileResult.error) throw profileResult.error;
    if (pmResult.error) throw pmResult.error;
    if (paymentsResult.error) throw paymentsResult.error;
    const product = productResult.data;
    const profile = profileResult.data;
    const isPrime = product.slug === "lead-host-prime";
    const [primeAccountResult, primePaymentsResult] = isPrime
      ? await Promise.all([
          supabase.from("prime_accounts").select("status,access_source,prime_started_at,prime_expires_at,grace_ends_at,account_manager_member_id")
            .eq("addon_subscription_id", subscription.id).maybeSingle(),
          supabase.from("prime_billing_periods").select("id,period_kind,total_amount_cents,currency,status,paid_at,billing_period_started_at,billing_period_ends_at,created_at")
            .eq("addon_subscription_id", subscription.id).order("created_at", { ascending: false }),
        ])
      : [{ data: null, error: null }, { data: [], error: null }];
    if (primeAccountResult.error) throw primeAccountResult.error;
    if (primePaymentsResult.error) throw primePaymentsResult.error;

    const accountManagerMemberId = primeAccountResult.data?.account_manager_member_id;
    const managerResult = accountManagerMemberId
      ? await supabase.from("team_members").select("profile_id").eq("id", accountManagerMemberId).maybeSingle()
      : { data: null, error: null };
    if (managerResult.error) throw managerResult.error;
    const managerProfileResult = managerResult.data?.profile_id
      ? await supabase.from("profiles").select("first_name,last_name,email").eq("id", managerResult.data.profile_id).maybeSingle()
      : { data: null, error: null };
    if (managerProfileResult.error) throw managerProfileResult.error;

    const addonPayments = paymentsResult.data ?? [];
    const primePayments = primePaymentsResult.data ?? [];
    const payments = isPrime ? primePayments.map((payment) => ({
      id: payment.id, kind: payment.period_kind, amountCents: payment.total_amount_cents,
      currency: payment.currency, status: payment.status, paidAt: payment.paid_at,
      periodStart: payment.billing_period_started_at, periodEnd: payment.billing_period_ends_at, createdAt: payment.created_at,
    })) : addonPayments.map((payment) => ({
      id: payment.id, kind: payment.payment_kind, amountCents: payment.amount_cents,
      currency: payment.currency, status: payment.status, paidAt: payment.paid_at,
      periodStart: payment.billing_period_started_at, periodEnd: payment.billing_period_ends_at, createdAt: payment.created_at,
    }));
    const paidPayments = payments.filter((payment) => payment.status === "paid");
    const manager = managerProfileResult.data;
    return NextResponse.json({
      propertyManager: {
        name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || pmResult.data?.company_name || profile.email,
        email: profile.email, phone: profile.phone, city: pmResult.data?.primary_city ?? null,
        accountStatus: profile.status, registeredAt: profile.created_at,
      },
      product: { slug: product.slug, name: product.name, currency: product.currency,
        priceCents: subscriptionReportingPrice(product.slug, subscription.metadata, product.sale_price_cents) },
      subscription: {
        id: subscription.id, status: subscription.status, source: subscription.source,
        trialStartedAt: subscription.trial_started_at, trialEndsAt: subscription.trial_ends_at,
        currentPeriodStartedAt: subscription.current_period_started_at, currentPeriodEndsAt: subscription.current_period_ends_at,
        cancelAtPeriodEnd: subscription.cancel_at_period_end, canceledAt: subscription.canceled_at,
        accessExpiresAt: subscription.access_expires_at, manualReason: subscription.manual_reason, createdAt: subscription.created_at,
      },
      prime: primeAccountResult.data ? {
        status: primeAccountResult.data.status, accessSource: primeAccountResult.data.access_source,
        accessEndsAt: primeAccountResult.data.prime_expires_at, graceEndsAt: primeAccountResult.data.grace_ends_at,
        accountManager: manager ? { name: [manager.first_name, manager.last_name].filter(Boolean).join(" ") || manager.email, email: manager.email } : null,
      } : null,
      summary: { totalPaidCents: paidPayments.reduce((sum, payment) => sum + payment.amountCents, 0), paymentCount: paidPayments.length },
      payments,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
