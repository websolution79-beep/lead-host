import { z } from "zod";
import { BOOKING_CALL_COMPENSATION_CENTS } from "./config";

const maxCents = 2_147_483_647;
const positiveCents = z.number().int().positive().max(maxCents);
const requestSchema = z.object({
  profileId: z.string().uuid(), propertyManagerId: z.string().uuid(), leadId: z.string().uuid(),
  leadAmountCents: positiveCents, bookingFeeCents: positiveCents,
  termsVersion: z.string().trim().min(1), requestId: z.string().uuid(),
}).refine(value => value.leadAmountCents <= maxCents - value.bookingFeeCents, "Totale non valido.");
export const bookingCallWalletPurchaseSchema = z.object({
  bookingCallId: z.string().uuid(), purchaseId: z.string().uuid(), leadId: z.string().uuid(),
  leadAmountCents: positiveCents, bookingFeeCents: positiveCents, amountCents: positiveCents,
  balanceCents: z.number().int().min(0).max(maxCents), compensationCents: z.literal(BOOKING_CALL_COMPENSATION_CENTS),
  qualifyingMemberId: z.string().uuid().nullable(), replayed: z.boolean(),
}).refine(value => value.amountCents === value.leadAmountCents + value.bookingFeeCents, "Importi non coerenti.");

type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
  data: unknown; error: { code?: string; message?: string; details?: string } | null;
}> };
export type BookingCallWalletRequest = z.infer<typeof requestSchema>;
export type BookingCallWalletPurchase = z.infer<typeof bookingCallWalletPurchaseSchema>;

export class BookingCallWalletError extends Error {
  constructor(public readonly code: string, public readonly mayHaveCompleted: boolean, public readonly details?: string) {
    super(code);
  }
}

// Caller must authenticate the PM, enforce the current terms version and reuse requestId on retries.
export async function purchaseBookingCallWithWallet(client: unknown, input: BookingCallWalletRequest): Promise<BookingCallWalletPurchase> {
  const request = requestSchema.parse(input);
  let result: Awaited<ReturnType<RpcClient["rpc"]>>;
  try {
    result = await (client as RpcClient).rpc("purchase_exclusive_lead_with_booking_call", {
      p_profile_id: request.profileId, p_property_manager_id: request.propertyManagerId, p_lead_id: request.leadId,
      p_expected_lead_amount_cents: request.leadAmountCents, p_expected_booking_fee_cents: request.bookingFeeCents,
      p_terms_version: request.termsVersion, p_request_id: request.requestId,
    });
  } catch {
    throw new BookingCallWalletError("BOOKING_PURCHASE_UNCONFIRMED", true);
  }
  if (result.error) {
    if (["PGRST202", "42883"].includes(result.error.code ?? "")) throw new BookingCallWalletError("BOOKING_MIGRATION_REQUIRED", false);
    const databaseRollback = /^[0-9A-Z]{5}$/.test(result.error.code ?? "") && !result.error.code?.startsWith("PGRST");
    throw new BookingCallWalletError(result.error.message ?? "BOOKING_PURCHASE_UNCONFIRMED", !databaseRollback, result.error.details);
  }
  const parsed = bookingCallWalletPurchaseSchema.safeParse(result.data);
  if (!parsed.success || parsed.data.bookingCallId !== request.requestId || parsed.data.leadId !== request.leadId ||
      parsed.data.leadAmountCents !== request.leadAmountCents || parsed.data.bookingFeeCents !== request.bookingFeeCents) {
    // The database may already have committed: do not turn a bad/empty response into a fresh purchase.
    throw new BookingCallWalletError("BOOKING_PURCHASE_UNCONFIRMED", true);
  }
  return parsed.data;
}
