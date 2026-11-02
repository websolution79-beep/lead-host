import { z } from "zod";

const cents = z.number().int().positive().max(2_147_483_647);
export const bookingCallAttemptSchema = z.object({
  version: z.literal(1), requestId: z.string().uuid(), leadAmountCents: cents, bookingFeeCents: cents,
}).strict().refine(value => value.leadAmountCents <= 2_147_483_647 - value.bookingFeeCents);
export type BookingCallAttempt = z.infer<typeof bookingCallAttemptSchema>;
type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
const key = (userId: string, leadId: string) => `leadhost:booking:v1:${userId}:${leadId}`;
export class UnreadableBookingCallAttemptError extends Error {}

export function loadBookingCallAttempt(storage: Storage, userId: string, leadId: string): BookingCallAttempt | null {
  const saved = storage.getItem(key(userId, leadId));
  if (!saved) return null;
  // Never discard an unreadable request that might already have debited the wallet.
  try { return bookingCallAttemptSchema.parse(JSON.parse(saved)); }
  catch { throw new UnreadableBookingCallAttemptError("Richiesta precedente non leggibile."); }
}

export function saveBookingCallAttempt(storage: Storage, userId: string, leadId: string, attempt: BookingCallAttempt) {
  const serialized = JSON.stringify(bookingCallAttemptSchema.parse(attempt));
  storage.setItem(key(userId, leadId), serialized);
  if (storage.getItem(key(userId, leadId)) !== serialized) throw new Error("Richiesta non memorizzata.");
}

export function clearBookingCallAttempt(storage: Storage, userId: string, leadId: string) {
  storage.removeItem(key(userId, leadId));
}
