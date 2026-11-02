import assert from "node:assert/strict";
import { test } from "node:test";
import { BookingCallWalletError, purchaseBookingCallWithWallet } from "./wallet";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const input = { profileId: uuid(1), propertyManagerId: uuid(2), leadId: uuid(3), requestId: uuid(4), leadAmountCents: 5000, bookingFeeCents: 1500, termsVersion: "fixture-terms" };
const data = { bookingCallId: uuid(4), purchaseId: uuid(5), leadId: uuid(3), leadAmountCents: 5000, bookingFeeCents: 1500, amountCents: 6500, balanceCents: 3500, compensationCents: 300, qualifyingMemberId: uuid(6), replayed: false };

test("the dedicated RPC receives both price components and the same retry key", async () => {
  const calls: unknown[] = [];
  const client = { rpc: async (name: string, args: unknown) => { calls.push({ name, args }); return { data, error: null }; } };
  assert.deepEqual(await purchaseBookingCallWithWallet(client, input), data);
  assert.deepEqual(await purchaseBookingCallWithWallet(client, input), data);
  assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(calls[0], { name: "purchase_exclusive_lead_with_booking_call", args: {
    p_profile_id: input.profileId, p_property_manager_id: input.propertyManagerId, p_lead_id: input.leadId,
    p_expected_lead_amount_cents: 5000, p_expected_booking_fee_cents: 1500, p_terms_version: "fixture-terms", p_request_id: input.requestId,
  } });
});

test("malformed inputs and overflow never reach the purchase command", async () => {
  for (const change of [{ bookingFeeCents: 0 }, { leadAmountCents: 0.5 }, { leadAmountCents: 2147483647 }, { requestId: "invalid" }, { termsVersion: " " }]) {
    await assert.rejects(purchaseBookingCallWithWallet({ rpc: () => { throw Error("must not call"); } }, { ...input, ...change }), { name: "ZodError" });
  }
});

test("unknown transport or response failures require recovery, not a new automatic charge", async () => {
  for (const response of [null, { ...data, amountCents: 5000 }, { ...data, bookingCallId: uuid(99) }, { ...data, leadId: uuid(99) }, { ...data, compensationCents: 500 }]) {
    await assert.rejects(purchaseBookingCallWithWallet({ rpc: async () => ({ data: response, error: null }) }, input), error => error instanceof BookingCallWalletError && error.mayHaveCompleted);
  }
  await assert.rejects(purchaseBookingCallWithWallet({ rpc: async () => { throw Error("offline"); } }, input), error => error instanceof BookingCallWalletError && error.mayHaveCompleted);
});

test("confirmed SQL rollback and a missing migration stay distinct from a lost success response", async () => {
  for (const code of ["P0001", "23505", "40001", "PGRST202", "42883"]) {
    await assert.rejects(purchaseBookingCallWithWallet({ rpc: async () => ({ data: null, error: { code, message: "fixture", details: "detail" } }) }, input), error => error instanceof BookingCallWalletError && !error.mayHaveCompleted);
  }
});
