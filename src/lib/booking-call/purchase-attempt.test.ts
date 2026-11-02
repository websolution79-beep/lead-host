import assert from "node:assert/strict";
import { test } from "node:test";
import { bookingCallAttemptSchema, clearBookingCallAttempt, loadBookingCallAttempt, saveBookingCallAttempt, UnreadableBookingCallAttemptError } from "./purchase-attempt";

const attempt = { version: 1 as const, requestId: "10000000-0000-4000-8000-000000000001", leadAmountCents: 5000, bookingFeeCents: 1500 };
function storage() {
  const data = new Map<string, string>();
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
}
test("pending booking request survives navigation with the same UUID and original components", () => {
  const store = storage();
  assert.equal(loadBookingCallAttempt(store, "pm-one", "lead-one"), null);
  saveBookingCallAttempt(store, "pm-one", "lead-one", attempt);
  assert.deepEqual(loadBookingCallAttempt(store, "pm-one", "lead-one"), attempt);
  assert.equal(loadBookingCallAttempt(store, "pm-two", "lead-one"), null);
  assert.equal(loadBookingCallAttempt(store, "pm-one", "lead-two"), null);
  clearBookingCallAttempt(store, "pm-one", "lead-one");
  assert.equal(loadBookingCallAttempt(store, "pm-one", "lead-one"), null);
});
test("corrupt stored requests are not silently discarded or converted into a fresh charge", () => {
  const store = storage(); saveBookingCallAttempt(store, "pm", "lead", attempt);
  const key = [...store.data.keys()][0]; store.data.set(key, "{invalid");
  assert.throws(() => loadBookingCallAttempt(store, "pm", "lead"), UnreadableBookingCallAttemptError); assert.equal(store.data.get(key), "{invalid");
  store.data.set(key, JSON.stringify({ ...attempt, version: 2 })); assert.throws(() => loadBookingCallAttempt(store, "pm", "lead"));
});
test("invalid components, overflow and blocked storage cannot initiate a stored request", () => {
  for (const value of [{ ...attempt, leadAmountCents: 0 }, { ...attempt, bookingFeeCents: 1.2 }, { ...attempt, leadAmountCents: 2147483647 }]) assert.equal(bookingCallAttemptSchema.safeParse(value).success, false);
  const store = storage(); store.setItem = () => {};
  assert.throws(() => saveBookingCallAttempt(store, "pm", "lead", attempt), /non memorizzata/);
});
