import { NextResponse, type NextRequest } from "next/server";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import { generatePrimeBillingInvoice } from "@/lib/billing/invoices";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ primeBillingPeriodId: string }> },
) {
  try {
    const { supabase, profile } = await requireSuperAdmin(request);
    const { primeBillingPeriodId } = await context.params;
    const invoice = await generatePrimeBillingInvoice({
      supabase,
      primeBillingPeriodId,
      actorProfileId: profile.id,
    });

    return NextResponse.json({ ok: true, invoice });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    return adminApiErrorResponse(error);
  }
}
