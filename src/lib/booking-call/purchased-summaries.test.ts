import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchPurchasedBookingSummaries } from "./purchased-summaries";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = { id: id(1), lead_purchase_id: id(2), status: "to_schedule", scheduled_at: null, lead_amount_cents: 5000, booking_fee_cents: 1500 };
function fixture(data: unknown[] = [row], error: { code?: string } | null = null) {
  const calls: Array<{ table: string; filters: Array<[string, string]>; ids?: string[] }> = [];
  const client = { from: (table: string) => {
    const call: typeof calls[number] = { table, filters: [] }; calls.push(call);
    return { select: () => ({ eq: (key: string, value: string) => { call.filters.push([key, value]); return { in: async (key: string, ids: string[]) => {
      assert.equal(key, "lead_purchase_id"); assert.ok(ids.length <= 100); call.ids = ids; return { data: error ? null : data.filter(value => ids.includes((value as typeof row).lead_purchase_id)), error };
    } }; } }) };
  } };
  return { client, calls };
}
test("summary reads are batched, scoped to the current PM and only purchased IDs", async () => {
  const f = fixture(); const ids = Array.from({ length: 205 }, (_, index) => id(index + 2));
  const result = await fetchPurchasedBookingSummaries(f.client, "current-pm", ids);
  assert.equal(f.calls.length, 3); assert.ok(f.calls.every(call => call.filters[0][0] === "property_manager_id" && call.filters[0][1] === "current-pm"));
  assert.deepEqual(result.get(id(2)), { id: id(1), status: "to_schedule", scheduledAt: null, leadAmountCents: 5000, bookingFeeCents: 1500 });
  assert.equal(JSON.stringify([...result.values()]).includes("qualifying"), false);
});
test("empty purchase lists do not query booking data; pre-migration schema remains compatible", async () => {
  const f = fixture(); assert.equal((await fetchPurchasedBookingSummaries(f.client, "pm", [])).size, 0); assert.equal(f.calls.length, 0);
  for (const code of ["PGRST205", "42P01"]) assert.equal((await fetchPurchasedBookingSummaries(fixture([], { code }).client, "pm", [id(2)])).size, 0);
});
test("operational failures are surfaced rather than silently losing the wait-for-team notice", async () => {
  await assert.rejects(fetchPurchasedBookingSummaries(fixture([], { code: "57014" }).client, "pm", [id(2)]));
  await assert.rejects(fetchPurchasedBookingSummaries(fixture([{ ...row, status: "unknown" }]).client, "pm", [id(2)]));
});
