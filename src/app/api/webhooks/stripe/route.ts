import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { getEnv } from "@/lib/env";
import { sendWalletTopUpEmail } from "@/lib/email/notifications";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

type TopUpCompletionResult = {
  wallet_id: string;
  profile_id: string;
  wallet_transaction_id: string;
  amount_cents: number;
  balance_cents: number;
  payment_id: string | null;
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
      const result = await completeWalletTopUp(session, event);
      const emailResult = "ignored" in result ? null : await notifyWalletTopUp(result);

      return NextResponse.json({ received: true, result, email: emailResult });
    }

    if (
      event.type === "checkout.session.expired" ||
      event.type === "checkout.session.async_payment_failed"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      await failWalletTopUp(
        session,
        event,
        event.type === "checkout.session.expired" ? "cancelled" : "failed",
      );
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
  });
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

  const supabase = createServiceSupabaseClient() as unknown as FailTopUpRpcClient;
  const { error } = await supabase.rpc("fail_wallet_top_up", {
    p_wallet_transaction_id: walletTransactionId,
    p_provider_checkout_session_id: session.id,
    p_status: status,
    p_raw_event: event as unknown as Json,
  });

  if (error) {
    throw new Error(error.message ?? "Ricarica wallet non aggiornata.");
  }
}
