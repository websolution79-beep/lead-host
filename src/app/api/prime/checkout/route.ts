import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import {
  PropertyManagerApiError,
  propertyManagerApiErrorResponse,
  requirePropertyManager,
} from "@/lib/api/property-manager-auth";
import { getBillingReadiness } from "@/lib/billing/server";
import { fetchCommercialSettings } from "@/lib/config/commercial-settings";
import { getEnv, getRequestAppUrl } from "@/lib/env";
import { CURRENT_TERMS_VERSION } from "@/lib/legal/terms";
import { ensurePrimeStripeCatalog } from "@/lib/prime/stripe-catalog";
import type { Json } from "@/lib/supabase/database.types";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

const checkoutSchema = z.object({ termsAccepted: z.literal(true) });
const PRIME_CHECKOUT_CATALOG_VERSION = 2;
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
      throw new PropertyManagerApiError(
        422,
        "Devi accettare i Termini e Condizioni per attivare PRIME.",
      );
    }

    const stripeKey = getEnv("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new PropertyManagerApiError(503, "Stripe non configurato.");

    const [eligibilityResult, accountResult, productResult, settingsResult, billing] =
      await Promise.all([
        supabase
          .from("prime_eligibilities")
          .select("is_enabled")
          .eq("profile_id", profile.id)
          .maybeSingle(),
        supabase
          .from("prime_accounts")
          .select("id,status,access_source,addon_subscription_id")
          .eq("profile_id", profile.id)
          .maybeSingle(),
        supabase
          .from("addon_products")
          .select("id,name,currency,stripe_product_id,terms_url")
          .eq("slug", "lead-host-prime")
          .single(),
        fetchCommercialSettings(supabase),
        getBillingReadiness(supabase, profile.id),
      ]);

    if (eligibilityResult.error) throw eligibilityResult.error;
    if (accountResult.error) throw accountResult.error;
    if (productResult.error || !productResult.data) throw productResult.error;
    if (!eligibilityResult.data?.is_enabled || !accountResult.data) {
      throw new PropertyManagerApiError(
        403,
        "L’offerta Lead Host PRIME non è abilitata per questo account.",
      );
    }
    if (accountResult.data.status === "active") {
      throw new PropertyManagerApiError(409, "Lead Host PRIME è già attivo sul tuo account.");
    }
    if (!billing.complete) {
      return NextResponse.json(
        {
          error: "Completa i dati di fatturazione nel profilo prima di attivare PRIME.",
          code: "BILLING_PROFILE_INCOMPLETE",
          missingLabels: billing.missingLabels,
        },
        { status: 422 },
      );
    }

    const { settings } = settingsResult;
    if (
      settings.primeFirstMonthServiceFeeCents < settings.primeRecurringServiceFeeCents ||
      settings.primeRecurringServiceFeeCents <= 0 ||
      settings.primeMonthlyWalletRechargeCents < 0
    ) {
      throw new PropertyManagerApiError(
        409,
        "La configurazione commerciale PRIME non è valida. Contatta l’assistenza.",
      );
    }

    const product = productResult.data;
    const stripe = new Stripe(stripeKey);
    const serviceSupabase = createServiceSupabaseClient();
    const { data: current, error: currentError } = await supabase
      .from("addon_subscriptions")
      .select("id,status,source,stripe_customer_id,metadata,updated_at")
      .eq("addon_product_id", product.id)
      .eq("profile_id", profile.id)
      .in("status", [...blockingStatuses])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (currentError) throw currentError;

    if (current?.status === "incomplete" && current.source === "stripe") {
      const existingUrl = await resolveOpenCheckoutUrl(
        stripe,
        current.metadata,
        PRIME_CHECKOUT_CATALOG_VERSION,
      );
      if (existingUrl) {
        return NextResponse.json({ ok: true, checkoutUrl: existingUrl, reused: true });
      }
      await supabase
        .from("addon_subscriptions")
        .update({ status: "expired", canceled_at: new Date().toISOString() })
        .eq("id", current.id)
        .eq("status", "incomplete");
    } else if (current) {
      throw new PropertyManagerApiError(
        409,
        current.source === "manual"
          ? "L’accesso PRIME è già gestito manualmente dal team."
          : "Hai già un abbonamento PRIME in corso.",
      );
    }

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

    const now = new Date().toISOString();
    const { data: pending, error: pendingError } = await supabase
      .from("addon_subscriptions")
      .insert({
        addon_product_id: product.id,
        profile_id: profile.id,
        status: "incomplete",
        source: "stripe",
        stripe_customer_id: previousStripeAccess?.stripe_customer_id ?? null,
        metadata: {
          terms_version: CURRENT_TERMS_VERSION,
          terms_accepted_at: now,
          prime_account_id: accountResult.data.id,
          prime_first_month_service_fee_cents: settings.primeFirstMonthServiceFeeCents,
          prime_recurring_service_fee_cents: settings.primeRecurringServiceFeeCents,
          prime_wallet_recharge_cents: settings.primeMonthlyWalletRechargeCents,
        },
      })
      .select("id,stripe_customer_id")
      .single();
    if (pendingError || !pending) {
      if (pendingError?.code === "23505") {
        throw new PropertyManagerApiError(409, "Esiste già un’attivazione PRIME in corso.");
      }
      throw pendingError;
    }

    try {
      const catalog = await ensurePrimeStripeCatalog({
        stripe,
        supabase: serviceSupabase,
        product,
        recurringServiceFeeCents: settings.primeRecurringServiceFeeCents,
        firstMonthServiceFeeCents: settings.primeFirstMonthServiceFeeCents,
        monthlyWalletRechargeCents: settings.primeMonthlyWalletRechargeCents,
      });
      const customerId = pending.stripe_customer_id || await createStripeCustomer(stripe, profile);
      const appUrl = getRequestAppUrl(request);
      const metadata = {
        kind: "prime_subscription",
        addon_slug: "lead-host-prime",
        addon_product_id: product.id,
        addon_subscription_id: pending.id,
        prime_account_id: accountResult.data.id,
        profile_id: profile.id,
        terms_version: CURRENT_TERMS_VERSION,
        prime_first_month_service_fee_cents: String(settings.primeFirstMonthServiceFeeCents),
        prime_recurring_service_fee_cents: String(settings.primeRecurringServiceFeeCents),
        prime_wallet_recharge_cents: String(settings.primeMonthlyWalletRechargeCents),
      };
      const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
        { price: catalog.membershipPriceId, quantity: 1 },
      ];
      if (catalog.startupPriceId) {
        lineItems.unshift({ price: catalog.startupPriceId, quantity: 1 });
      }

      const renewalTotalCents =
        settings.primeRecurringServiceFeeCents + settings.primeMonthlyWalletRechargeCents;

      const renewalMessage = settings.primeMonthlyWalletRechargeCents > 0
        ? `Dal secondo mese ${formatMoney(renewalTotalCents)} al mese (${formatMoney(settings.primeMonthlyWalletRechargeCents)} di credito Wallet + ${formatMoney(settings.primeRecurringServiceFeeCents)} di servizio PRIME).`
        : `Dal secondo mese ${formatMoney(renewalTotalCents)} al mese per il servizio Lead Host PRIME.`;

      const session = await stripe.checkout.sessions.create(
        {
          mode: "subscription",
          customer: customerId,
          client_reference_id: pending.id,
          success_url: `${appUrl}/app/prime?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appUrl}/app/prime?checkout=cancelled`,
          locale: "it",
          metadata,
          subscription_data: { metadata },
          line_items: lineItems,
          custom_text: {
            submit: {
              message: renewalMessage,
            },
          },
        },
        { idempotencyKey: `prime-checkout-${pending.id}` },
      );
      if (!session.url) throw new Error("Checkout Stripe senza URL.");

      const checkoutMetadata = {
        terms_version: CURRENT_TERMS_VERSION,
        terms_accepted_at: now,
        prime_account_id: accountResult.data.id,
        stripe_checkout_session_id: session.id,
        stripe_checkout_expires_at: new Date(session.expires_at * 1000).toISOString(),
        first_month_service_fee_cents: settings.primeFirstMonthServiceFeeCents,
        recurring_service_fee_cents: settings.primeRecurringServiceFeeCents,
        wallet_recharge_cents: settings.primeMonthlyWalletRechargeCents,
        membership_price_id: catalog.membershipPriceId,
        startup_price_id: catalog.startupPriceId,
        checkout_catalog_version: PRIME_CHECKOUT_CATALOG_VERSION,
      };
      const [subscriptionUpdate, accountUpdate] = await Promise.all([
        supabase
          .from("addon_subscriptions")
          .update({
            stripe_customer_id: customerId,
            stripe_price_id: catalog.membershipPriceId,
            metadata: checkoutMetadata,
          })
          .eq("id", pending.id),
        serviceSupabase
          .from("prime_accounts")
          .update({
            addon_subscription_id: pending.id,
            access_source: "stripe",
            payment_status: "pending",
          })
          .eq("id", accountResult.data.id),
      ]);
      if (subscriptionUpdate.error) throw subscriptionUpdate.error;
      if (accountUpdate.error) throw accountUpdate.error;

      return NextResponse.json({ ok: true, checkoutUrl: session.url, reused: false });
    } catch (error) {
      await Promise.allSettled([
        supabase
          .from("addon_subscriptions")
          .update({
            status: "expired",
            canceled_at: new Date().toISOString(),
            metadata: {
              checkout_error: error instanceof Error ? error.message.slice(0, 500) : "unknown",
            },
          })
          .eq("id", pending.id),
        serviceSupabase
          .from("prime_accounts")
          .update({ addon_subscription_id: null, access_source: "none", payment_status: "not_applicable" })
          .eq("id", accountResult.data.id)
          .eq("addon_subscription_id", pending.id),
      ]);
      throw error;
    }
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}

async function resolveOpenCheckoutUrl(
  stripe: Stripe,
  metadata: Json,
  expectedCatalogVersion: number,
) {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") return null;
  const sessionId = typeof metadata.stripe_checkout_session_id === "string"
    ? metadata.stripe_checkout_session_id
    : null;
  if (!sessionId) return null;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const catalogVersion = Number(metadata.checkout_catalog_version ?? 0);
    if (catalogVersion !== expectedCatalogVersion) {
      if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
      return null;
    }
    return session.status === "open" ? session.url : null;
  } catch {
    return null;
  }
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
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
