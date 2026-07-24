import { randomUUID } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import {
  propertyManagerApiErrorResponse,
  requirePropertyManager,
} from "@/lib/api/property-manager-auth";
import { getBillingReadiness } from "@/lib/billing/server";
import { fetchCommercialSettings } from "@/lib/config/commercial-settings";
import { appUrl, getEnv } from "@/lib/env";
import { recordTermsAcceptance } from "@/lib/legal/acceptances";
import { CURRENT_TERMS_VERSION } from "@/lib/legal/terms";

const checkoutSchema = z.object({
  amountCents: z.number().int().positive().max(200000),
  termsAccepted: z.literal(true),
  termsVersion: z.string().trim().min(1),
});

type WalletRow = {
  id: string;
  profile_id: string;
  balance_cents: number;
  currency: string;
};

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile, propertyManager } =
      await requirePropertyManager(request);
    const parsedPayload = checkoutSchema.safeParse(
      await request.json().catch(() => null),
    );

    if (!parsedPayload.success) {
      return NextResponse.json(
        {
          error:
            "Devi accettare le Condizioni del Servizio per effettuare la ricarica.",
          code: "TERMS_ACCEPTANCE_REQUIRED",
        },
        { status: 422 },
      );
    }

    const payload = parsedPayload.data;

    if (payload.termsVersion !== CURRENT_TERMS_VERSION) {
      return NextResponse.json(
        {
          error:
            "Le Condizioni del Servizio sono state aggiornate. Rileggile e conferma nuovamente.",
          code: "TERMS_VERSION_CHANGED",
          termsVersion: CURRENT_TERMS_VERSION,
        },
        { status: 409 },
      );
    }

    const billing = await getBillingReadiness(supabase, profile.id);

    if (!billing.complete) {
      return NextResponse.json(
        {
          error:
            "Prima di effettuare una ricarica devi completare i dati necessari alla fatturazione.",
          code: "BILLING_PROFILE_INCOMPLETE",
          missingFields: billing.missingFields,
          missingLabels: billing.missingLabels,
        },
        { status: 422 },
      );
    }

    const stripeSecretKey = getEnv("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      return NextResponse.json(
        { error: "Stripe non configurato.", code: "STRIPE_NOT_CONFIGURED" },
        { status: 503 },
      );
    }

    const { settings } = await fetchCommercialSettings(supabase);

    if (payload.amountCents < settings.minTopUpCents) {
      return NextResponse.json(
        {
          error: "Importo inferiore alla ricarica minima.",
          code: "MIN_TOP_UP_REQUIRED",
          minTopUpCents: settings.minTopUpCents,
        },
        { status: 400 },
      );
    }

    const wallet = await getOrCreateWallet({
      supabase,
      profileId: profile.id,
    });
    const transactionId = randomUUID();
    const { data: transaction, error: transactionError } = await supabase
      .from("wallet_transactions")
      .insert({
        id: transactionId,
        wallet_id: wallet.id,
        profile_id: profile.id,
        type: "top_up",
        status: "pending",
        amount_cents: payload.amountCents,
        balance_after_cents: null,
        description: "Ricarica wallet",
        provider: "stripe",
        metadata: {
          property_manager_id: propertyManager.id,
          profile_email: profile.email,
          terms_version: CURRENT_TERMS_VERSION,
        },
      })
      .select("id,wallet_id,profile_id,amount_cents,status")
      .single();

    if (transactionError || !transaction) throw transactionError;

    const { error: acceptanceError } = await recordTermsAcceptance(supabase, {
      profileId: profile.id,
      context: "wallet_top_up",
      termsVersion: CURRENT_TERMS_VERSION,
      walletTransactionId: transaction.id,
      metadata: {
        amount_cents: payload.amountCents,
      },
    });

    if (acceptanceError) {
      await supabase
        .from("wallet_transactions")
        .update({ status: "failed" })
        .eq("id", transaction.id);

      return NextResponse.json(
        {
          error:
            "Il sistema di registrazione delle Condizioni non è ancora disponibile. Riprova dopo l'aggiornamento del database.",
          code: "TERMS_ACCEPTANCE_UNAVAILABLE",
        },
        { status: 409 },
      );
    }

    const stripe = new Stripe(stripeSecretKey);
    const checkoutSession = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        success_url: `${appUrl}/app/acquisti?wallet=success`,
        cancel_url: `${appUrl}/app/acquisti?wallet=cancelled`,
        customer_email: profile.email,
        client_reference_id: transaction.id,
        metadata: {
          kind: "wallet_top_up",
          wallet_transaction_id: transaction.id,
          wallet_id: wallet.id,
          profile_id: profile.id,
          property_manager_id: propertyManager.id,
          terms_version: CURRENT_TERMS_VERSION,
        },
        payment_intent_data: {
          metadata: {
            kind: "wallet_top_up",
            wallet_transaction_id: transaction.id,
            wallet_id: wallet.id,
            profile_id: profile.id,
            terms_version: CURRENT_TERMS_VERSION,
          },
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: wallet.currency,
              unit_amount: payload.amountCents,
              product_data: {
                name: "Ricarica wallet Lead Host",
                description: "Credito utilizzabile per acquistare lead nel marketplace.",
              },
            },
          },
        ],
      },
      {
        idempotencyKey: `wallet-top-up-${transaction.id}`,
      },
    );

    if (!checkoutSession.url) {
      await supabase
        .from("wallet_transactions")
        .update({ status: "failed" })
        .eq("id", transaction.id);

      return NextResponse.json(
        { error: "Checkout Stripe non disponibile.", code: "CHECKOUT_URL_MISSING" },
        { status: 502 },
      );
    }

    await supabase
      .from("wallet_transactions")
      .update({
        provider_reference: checkoutSession.id,
        metadata: {
          property_manager_id: propertyManager.id,
          profile_email: profile.email,
          stripe_checkout_session_id: checkoutSession.id,
          terms_version: CURRENT_TERMS_VERSION,
        },
      })
      .eq("id", transaction.id);

    return NextResponse.json({
      ok: true,
      checkoutUrl: checkoutSession.url,
      checkoutSessionId: checkoutSession.id,
      walletTransactionId: transaction.id,
    });
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}

async function getOrCreateWallet({
  supabase,
  profileId,
}: {
  supabase: Awaited<ReturnType<typeof requirePropertyManager>>["supabase"];
  profileId: string;
}) {
  const { data: existingWallet, error: walletError } = await supabase
    .from("wallets")
    .select("id,profile_id,balance_cents,currency")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (walletError) throw walletError;
  if (existingWallet) return existingWallet as WalletRow;

  const { data: wallet, error: createWalletError } = await supabase
    .from("wallets")
    .insert({ profile_id: profileId })
    .select("id,profile_id,balance_cents,currency")
    .single();

  if (createWalletError || !wallet) throw createWalletError;

  return wallet as WalletRow;
}
