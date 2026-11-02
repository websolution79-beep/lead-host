import { z } from "zod";

const contact = z.object({ firstName: z.string().nullable(), lastName: z.string().nullable(), email: z.string().nullable(), phone: z.string().nullable() });
export const bookingCallTaskSchema = z.object({
  id: z.string().uuid(), leadId: z.string().uuid(), ownerRequestId: z.string().uuid(), purchaseId: z.string().uuid(), propertyManagerId: z.string().uuid(),
  qualifyingMemberId: z.string().uuid().nullable(), assignedMemberId: z.string().uuid().nullable(),
  status: z.enum(["to_schedule", "in_progress", "scheduled", "refunded"]), scheduledAt: z.string().nullable(), createdAt: z.string(),
  leadAmountCents: z.number().int().positive(), bookingFeeCents: z.number().int().positive(), totalAmountCents: z.number().int().positive(),
  compensationCents: z.literal(300), needsAttribution: z.boolean(), leadTitle: z.string(), city: z.string().nullable(),
  owner: contact.extend({ address: z.string().nullable() }),
  buyer: contact.extend({ profileId: z.string().uuid(), email: z.string().email(), companyName: z.string().nullable() }),
  coordinatorName: z.string().nullable(),
  emailStatus: z.enum(["pending", "processing", "sent", "skipped"]).nullable().optional(),
  emailLastError: z.string().nullable().optional(),
});
export type BookingCallTask = z.infer<typeof bookingCallTaskSchema>;
export const bookingCallEmailContextSchema = bookingCallTaskSchema.extend({
  balanceCents: z.number().int().nonnegative(),
  recipients: z.array(z.object({ profileId: z.string().uuid(), email: z.string().email(), firstName: z.string().nullable(), lastName: z.string().nullable() })),
});
export type BookingCallSummary = { id: string; status: BookingCallTask["status"]; scheduledAt: string | null; leadAmountCents: number; bookingFeeCents: number };
export const BOOKING_CALL_WAIT_NOTICE = "Non contattare direttamente il proprietario. Attendi di essere contattato da un Account Manager di Lead Host, che organizzerà la chiamata conoscitiva.";
