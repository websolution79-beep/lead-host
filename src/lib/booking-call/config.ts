import { z } from "zod";

export const BOOKING_CALL_COMPENSATION_CENTS = 300;
const MAX_CENTS = 2_147_483_647;
const cents = z.number().int().min(0).max(MAX_CENTS);
const readinessSchema = z.object({
  schemaVersion: z.literal(1), enabled: z.boolean(), feeCents: cents,
  compensationCents: z.literal(BOOKING_CALL_COMPENSATION_CENTS), currency: z.literal("EUR"),
});

export type BookingCallConfig = z.infer<typeof readinessSchema> & { storageReady: boolean };
export type BookingCallWorkflowConfig = Omit<BookingCallConfig, "schemaVersion"> & { workflowReady: boolean };
type RpcClient = { rpc: (name: string) => PromiseLike<{ data: unknown; error: { code?: string } | null }> };

export async function fetchBookingCallConfig(client: unknown): Promise<BookingCallConfig> {
  const disabled: BookingCallConfig = { schemaVersion: 1, storageReady: false, enabled: false,
    feeCents: 0, compensationCents: BOOKING_CALL_COMPENSATION_CENTS, currency: "EUR" };
  try {
    const result = await (client as RpcClient).rpc("get_marketplace_booking_call_readiness_v1");
    if (result.error) return disabled;
    const parsed = readinessSchema.safeParse(result.data);
    if (!parsed.success) return disabled;
    return { ...parsed.data, enabled: parsed.data.enabled && parsed.data.feeCents > 0, storageReady: true };
  } catch {
    return disabled;
  }
}

export async function fetchBookingCallWorkflowConfig(client: unknown): Promise<BookingCallWorkflowConfig> {
  const disabled: BookingCallWorkflowConfig = { storageReady: false, enabled: false, workflowReady: false,
    feeCents: 0, compensationCents: BOOKING_CALL_COMPENSATION_CENTS, currency: "EUR" };
  try {
    const result = await (client as RpcClient).rpc("get_marketplace_booking_call_readiness_v3");
    const schema = readinessSchema.extend({ schemaVersion: z.literal(3), engineReady: z.literal(true), workflowReady: z.literal(true) });
    const parsed = schema.safeParse(result.data);
    if (result.error || !parsed.success) return disabled;
    return { ...parsed.data, storageReady: true, enabled: parsed.data.enabled && parsed.data.feeCents > 0 };
  } catch { return disabled; }
}

export function quoteBookingCall(input: {
  config: Pick<BookingCallConfig, "storageReady" | "enabled" | "feeCents" | "compensationCents" | "currency">;
  leadAmountCents: number; visibilityMode: string; exclusiveAvailable: boolean;
}) {
  const { config, leadAmountCents } = input;
  if (!config.storageReady || !config.enabled || config.compensationCents !== BOOKING_CALL_COMPENSATION_CENTS ||
      config.currency !== "EUR" || input.visibilityMode !== "public" || !input.exclusiveAvailable ||
      !cents.safeParse(leadAmountCents).success || leadAmountCents <= 0 ||
      !cents.safeParse(config.feeCents).success || config.feeCents <= 0 ||
      leadAmountCents > MAX_CENTS - config.feeCents) return null;
  return { leadAmountCents, bookingFeeCents: config.feeCents, totalAmountCents: leadAmountCents + config.feeCents,
    compensationCents: BOOKING_CALL_COMPENSATION_CENTS, currency: "EUR" as const };
}
