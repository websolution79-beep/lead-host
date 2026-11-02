import { after, NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requirePropertyManager, propertyManagerApiErrorResponse } from "@/lib/api/property-manager-auth";
import { purchaseBookingCallWithWallet, BookingCallWalletError } from "@/lib/booking-call/wallet";
import { bookingCallHttpError } from "@/lib/booking-call/http-error";
import { fetchBookingCallWorkflowConfig } from "@/lib/booking-call/config";
import { runBookingCallEmailWorkerSafely } from "@/lib/booking-call/email-worker";
import { runMarketplacePromotionWorkerSafely } from "@/lib/team-compensation/marketplace-promotion-worker";
import { runBrevoWorkerSafely } from "@/lib/brevo/worker";
import { MARKETPLACE_LEADS_CACHE_TAG } from "@/lib/cache/tags";
import { CURRENT_TERMS_VERSION } from "@/lib/legal/terms";

export const maxDuration = 60;
const schema = z.object({ leadId: z.string().uuid(), requestId: z.string().uuid(), expectedLeadAmountCents: z.number().int().positive().max(2147483647),
  expectedBookingFeeCents: z.number().int().positive().max(2147483647), termsAccepted: z.literal(true), termsVersion: z.string().trim().min(1) }).strict()
  .refine(value => value.expectedLeadAmountCents <= 2147483647 - value.expectedBookingFeeCents);

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile, propertyManager } = await requirePropertyManager(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ code: "INVALID_BOOKING_REQUEST", error: "Controlla la richiesta e accetta le Condizioni del Servizio." }, { status: 422 });
    if (parsed.data.termsVersion !== CURRENT_TERMS_VERSION) return NextResponse.json({ code: "TERMS_VERSION_CHANGED", error: "Le condizioni sono cambiate. Rileggile e conferma nuovamente." }, { status: 409 });
    const config = await fetchBookingCallWorkflowConfig(supabase);
    if (!config.workflowReady) return NextResponse.json({ code: "BOOKING_NOT_READY", error: "Servizio booking Call in aggiornamento." }, { status: 409 });
    const purchase = await purchaseBookingCallWithWallet(supabase, {
      profileId: profile.id, propertyManagerId: propertyManager.id, leadId: parsed.data.leadId, requestId: parsed.data.requestId,
      leadAmountCents: parsed.data.expectedLeadAmountCents, bookingFeeCents: parsed.data.expectedBookingFeeCents, termsVersion: CURRENT_TERMS_VERSION,
    });
    after(async () => { await Promise.allSettled([runBookingCallEmailWorkerSafely(1, purchase.bookingCallId), runMarketplacePromotionWorkerSafely(10), runBrevoWorkerSafely(10)]); });
    try { revalidateTag(MARKETPLACE_LEADS_CACHE_TAG, "max"); }
    catch { console.error("Booking completato: invalidazione cache non disponibile."); }
    return NextResponse.json({ ok: true, ...purchase });
  } catch (error) {
    if (error instanceof BookingCallWalletError) { const response = bookingCallHttpError(error); return NextResponse.json(response.body, { status: response.status }); }
    return propertyManagerApiErrorResponse(error);
  }
}
