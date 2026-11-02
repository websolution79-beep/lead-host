import { z } from "zod";
import { readRowsInIdBatches } from "@/lib/supabase/batched-query";
import type { BookingCallSummary } from "./contracts";

const rowSchema = z.object({
  id: z.string().uuid(), lead_purchase_id: z.string().uuid(), status: z.enum(["to_schedule", "in_progress", "scheduled", "refunded"]),
  scheduled_at: z.string().nullable(), lead_amount_cents: z.number().int().positive(), booking_fee_cents: z.number().int().positive(),
});
type Query = { eq: (key: string, value: string) => Query; in: (key: string, ids: string[]) => PromiseLike<{ data: unknown[] | null; error: { code?: string } | null }> };

// Both filters are server-derived: never accept a caller-supplied PM or foreign purchase ID.
export async function fetchPurchasedBookingSummaries(client: unknown, propertyManagerId: string, ownedPurchaseIds: string[]) {
  const result = new Map<string, BookingCallSummary>();
  if (!ownedPurchaseIds.length) return result;
  const db = client as { from: (name: string) => { select: (fields: string) => Query } };
  try {
    const rows = await readRowsInIdBatches(ownedPurchaseIds, batch => db.from("marketplace_booking_calls")
      .select("id,lead_purchase_id,status,scheduled_at,lead_amount_cents,booking_fee_cents")
      .eq("property_manager_id", propertyManagerId).in("lead_purchase_id", batch));
    const allowed = new Set(ownedPurchaseIds);
    for (const value of rows) {
      const row = rowSchema.parse(value);
      if (!allowed.has(row.lead_purchase_id)) throw new Error("Booking non corrispondente agli acquisti.");
      result.set(row.lead_purchase_id, { id: row.id, status: row.status, scheduledAt: row.scheduled_at,
        leadAmountCents: row.lead_amount_cents, bookingFeeCents: row.booking_fee_cents });
    }
    return result;
  } catch (error) {
    // Compatibility with pre-foundation installations only; do not hide an operational failure.
    if (error && typeof error === "object" && "code" in error && ["PGRST205", "42P01"].includes(String(error.code))) return result;
    throw error;
  }
}
