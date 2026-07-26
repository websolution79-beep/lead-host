import { NextResponse, type NextRequest } from "next/server";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import { generateWalletTopUpInvoice } from "@/lib/billing/invoices";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ walletTransactionId: string }> },
) {
  try {
    const { supabase, profile } = await requireSuperAdmin(request);
    const { walletTransactionId } = await context.params;
    const invoice = await generateWalletTopUpInvoice({
      supabase,
      walletTransactionId,
      actorProfileId: profile.id,
    });

    return NextResponse.json({ ok: true, invoice });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
