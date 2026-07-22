import { NextResponse, type NextRequest } from "next/server";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import { sendWalletTopUpEmail } from "@/lib/email/notifications";

type RouteContext = {
  params: Promise<{
    walletTransactionId: string;
  }>;
};

type ProfileRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
};

type WalletTransactionRow = {
  id: string;
  profile_id: string;
  type: string;
  status: string;
  amount_cents: number;
  balance_after_cents: number | null;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { walletTransactionId } = await context.params;
    const { supabase } = await requireSuperAdmin(request);
    const { data: transaction, error: transactionError } = await supabase
      .from("wallet_transactions")
      .select("id,profile_id,type,status,amount_cents,balance_after_cents")
      .eq("id", walletTransactionId)
      .maybeSingle();

    if (transactionError) throw transactionError;

    if (!transaction) {
      return NextResponse.json(
        { error: "Transazione wallet non trovata." },
        { status: 404 },
      );
    }

    const walletTransaction = transaction as WalletTransactionRow;

    if (walletTransaction.type !== "top_up" || walletTransaction.status !== "completed") {
      return NextResponse.json(
        { error: "La mail puo essere inviata solo per ricariche completate." },
        { status: 422 },
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id,email,first_name,last_name,status")
      .eq("id", walletTransaction.profile_id)
      .maybeSingle();

    if (profileError) throw profileError;

    if (!profile || profile.status !== "active") {
      return NextResponse.json(
        { error: "Profilo PM non trovato o non attivo." },
        { status: 404 },
      );
    }

    const result = await sendWalletTopUpEmail({
      profile: profile as ProfileRow,
      walletTransactionId: walletTransaction.id,
      amountCents: walletTransaction.amount_cents,
      balanceCents: walletTransaction.balance_after_cents ?? walletTransaction.amount_cents,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
