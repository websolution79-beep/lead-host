import assert from "node:assert/strict";
import { test } from "node:test";
import { processBookingCallEmails, type BookingMail } from "./email-delivery";
import { bookingCallEmailContextSchema } from "./contracts";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture() {
  const context = bookingCallEmailContextSchema.parse({
    id: id(1), leadId: id(2), ownerRequestId: id(3), purchaseId: id(4), propertyManagerId: id(5),
    qualifyingMemberId: id(6), assignedMemberId: id(6), status: "to_schedule", scheduledAt: null, createdAt: "2026-11-02T12:00:00Z",
    leadAmountCents: 5000, bookingFeeCents: 1500, totalAmountCents: 6500, compensationCents: 300, needsAttribution: false,
    leadTitle: "Casa <Milano>", city: "Milano", owner: { firstName: "Owner", lastName: "Test", email: "owner@example.invalid", phone: "3331111111", address: "Via Test" },
    buyer: { profileId: id(7), firstName: "Buyer", lastName: "Test", email: "buyer@example.invalid", phone: "3332222222", companyName: "Test" },
    coordinatorName: "Qualifier", balanceCents: 10000,
    recipients: [{ profileId: id(8), email: "qualifier@example.invalid", firstName: "Qualifier", lastName: "Test" }],
  });
  const sent: BookingMail[] = [];
  const logs = new Set<string>();
  const finished: string[] = [];
  let claims = 0, reads = 0, admin = 0;
  const deps: Parameters<typeof processBookingCallEmails>[0] = {
    rpc: async (name, args) => {
      if (name === "claim_booking_call_emails") { claims++; return { data: claims === 1 ? [{ booking_call_id: id(1), lease_id: id(9) }] : [], error: null }; }
      if (name === "get_booking_call_email_context") { reads++; return { data: context, error: null }; }
      if (name === "finish_booking_call_email") { finished.push(String(args.p_status)); return { data: true, error: null }; }
      throw Error(`Unexpected RPC ${name}`);
    },
    send: async payload => { sent.push(payload); logs.add(`${payload.eventType}/${payload.to}`); return { status: "sent" }; },
    wasSent: async (_purchase, event, recipient) => logs.has(`${event}/${recipient}`),
    notifyAdmin: async () => { admin++; },
  };
  return { context, deps, sent, logs, finished, get reads() { return reads; }, get admin() { return admin; }, resetClaim() { claims = 0; } };
}

test("booking sends PM confirmation and only the designated coordinator; retries use sent logs", async () => {
  const f = fixture();
  assert.equal((await processBookingCallEmails(f.deps)).sent, 1);
  assert.deepEqual(f.sent.map(mail => mail.to), ["buyer@example.invalid", "qualifier@example.invalid"]);
  assert.equal(f.sent[1].templateVariables.owner_phone, "3331111111");
  assert.equal(f.sent[1].templateVariables.property_manager_phone, "3332222222");
  assert.equal(f.sent[0].leadPurchaseId, id(4)); assert.equal(f.sent[0].metadata.booking_call_id, id(1));
  assert.equal(new Set(f.sent.map(mail => mail.idempotencyKey)).size, 2); assert.equal(f.admin, 1);
  f.resetClaim(); await processBookingCallEmails(f.deps);
  assert.equal(f.sent.length, 2); assert.deepEqual(f.finished, ["sent", "sent"]);
});

test("partial failure queues recovery without repeating the PM email", async () => {
  const f = fixture(), original = f.deps.send;
  f.deps.send = async payload => payload.eventType === "team.booking_call_requested" ? { status: "failed" } : original(payload);
  assert.equal((await processBookingCallEmails(f.deps)).failed, 1); assert.deepEqual(f.finished, ["pending"]);
  f.deps.send = original; f.resetClaim();
  assert.equal((await processBookingCallEmails(f.deps)).sent, 1); assert.equal(f.sent.length, 2);
});

test("unconfigured sender retries; deliberate template disable is respected", async () => {
  for (const reason of [undefined, "disabled"]) {
    const f = fixture(); f.deps.send = async () => ({ status: "skipped", reason });
    const result = await processBookingCallEmails(f.deps);
    assert.equal(result.failed, reason ? 0 : 1); assert.equal(f.finished[0], reason ? "sent" : "pending");
  }
});

test("expired or invalid context cannot broadcast or permanently drop an unsent job", async () => {
  for (const value of [null, {}, { ...fixture().context, id: id(99) }]) {
    const f = fixture(), original = f.deps.rpc;
    f.deps.rpc = async (name, args) => name === "get_booking_call_email_context" ? { data: value, error: null } : original(name, args);
    await processBookingCallEmails(f.deps);
    assert.equal(f.sent.length, 0); assert.deepEqual(f.finished, ["pending"]);
  }
});

test("refund or assignment change during delivery stops operational email", async () => {
  const f = fixture(), original = f.deps.rpc; let reads = 0;
  f.deps.rpc = async (name, args) => name === "get_booking_call_email_context" && ++reads > 1 ? { data: null, error: null } : original(name, args);
  await processBookingCallEmails(f.deps);
  assert.deepEqual(f.sent.map(mail => mail.eventType), ["lead.booking_call_purchased"]); assert.equal(f.admin, 0);
});

test("missing qualifier notifies only explicit admin fallback and marks attribution pending", async () => {
  const f = fixture(); f.context.needsAttribution = true; f.context.assignedMemberId = null; f.context.qualifyingMemberId = null;
  f.context.recipients = [{ profileId: id(20), email: "admin@example.invalid", firstName: "Admin", lastName: null }];
  await processBookingCallEmails(f.deps);
  assert.deepEqual(f.sent.map(mail => mail.to), ["buyer@example.invalid", "admin@example.invalid"]);
  assert.match(String(f.sent[1].templateVariables.commission_notice), /da attribuire/);
});

test("unavailable migration is dormant and no email is sent", async () => {
  const f = fixture(); f.deps.rpc = async () => ({ data: null, error: { code: "PGRST202" } });
  assert.equal((await processBookingCallEmails(f.deps)).storageReady, false); assert.equal(f.sent.length, 0);
});

test("bounded worker claims jobs one by one and supports a targeted manual retry", async () => {
  const f = fixture(), original = f.deps.rpc; let claims = 0;
  f.deps.rpc = async (name, args) => {
    if (name === "claim_booking_call_emails") {
      claims++; assert.equal(args.p_limit, 1); assert.equal(args.p_booking_call_id, id(1));
      return { data: [{ booking_call_id: id(1), lease_id: id(9) }], error: null };
    }
    return original(name, args);
  };
  await processBookingCallEmails(f.deps, 999, id(1)); assert.equal(claims, 3); assert.equal(f.sent.length, 2);
});
