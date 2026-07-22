import { randomUUID } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import {
  propertyManagerApiErrorResponse,
  requirePropertyManager,
} from "@/lib/api/property-manager-auth";
import { fetchCommercialSettings } from "@/lib/config/commercial-settings";
import { appUrl, getEnv } from "@/lib/env";

const checkoutSchema = z.object({
  amountCents: z.number().int().positive().max(200000),
});

type WalletRow = {
  id: string;
  profile_id: string;
  balance_cents: number;
  currency: string;
};

type WalletTransactionRow = {
  id: string;
  wallet_id: string;
  profile_id: string;
  amount_cents: number;
  status: "pending" | "completed" | "failed" | "cancelled";
};

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile, propertyManager } =
      await requirePropertyManager(request);
    const stripeSecretKey = getEnv("STRIPE_SECRET_KEY");

    if (!stripeSecretKey) {
      return NextResponse.json(
        { error: "Stripe non configurato.", code: "STRIPE_NOT_CONFIGURED" },
        { status: 503 },
      );
    }

    const payload = checkoutSchema.parse(await request.json());
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
        },
      })
      .select("id,wallet_id,profile_id,amount_cents,status")
      .single();

    if (transactionError || !transaction) throw transactionError;

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
        },
        payment_intent_data: {
          metadata: {
            kind: "wallet_top_up",
            wallet_transaction_id: transaction.id,
            wallet_id: wallet.id,
            profile_id: profile.id,
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
