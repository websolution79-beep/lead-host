import { NextResponse, type NextRequest } from "next/server";
import { AdminApiError, adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import { generateMarketplaceInvoice } from "@/lib/billing/invoices";

export async function POST(request: NextRequest,
  context: { params: Promise<{ marketplacePaymentId: string }> }) {
  try {
    const { supabase, profile, isSuperAdmin } = await requireSuperAdmin(request);
    if (!isSuperAdmin) throw new AdminApiError(403, "Ruolo Super Admin richiesto.");
    const { marketplacePaymentId } = await context.params;
    const invoice = await generateMarketplaceInvoice({ supabase, marketplacePaymentId,
      actorProfileId: profile.id });
    return NextResponse.json({ ok: true, invoice });
  } catch (error) { return adminApiErrorResponse(error); }
}
