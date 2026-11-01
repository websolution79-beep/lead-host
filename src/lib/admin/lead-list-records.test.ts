import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchAdminLeadListRecords } from "./lead-list-records";

test("summary hydration is scoped, preserves row fields and does not read detail tables", async () => {
  const calls: { table: string; ids: unknown }[] = [];
  const rows: Record<string, unknown[]> = {
    owner_requests: [{ id: "request", created_at: "2026-01-01", status: "published", owner_verified: true, duplicate_check: { status: "clear", matches: ["private"] } }],
    owner_contacts: [{ owner_request_id: "request", first_name: "Fixture", last_name: "Owner", email: "fixture@example.invalid" }],
    properties: [{ owner_request_id: "request", property_type: "Appartamento", city: "Milano", province: "Milano", region: "Lombardia" }],
    leads: [{ owner_request_id: "request", id: "lead", title: "Fixture", internal_status: "available", visibility_mode: "public", published_at: "2026-01-01", expires_at: "2100-01-01", visible_until: null, sold_visible_until: null, exclusive_purchase_id: null, shared_slots_sold: 0 }],
    lead_purchases: [{ id: "purchase", lead_id: "lead", property_manager_id: "manager", mode: "exclusive", status: "paid", amount_cents: 5000, created_at: "2026-01-01" }],
    property_manager_profiles: [{ id: "manager", profile_id: "profile", company_name: "Fixture Company" }],
    profiles: [{ id: "profile", first_name: "Fixture", last_name: "Buyer", email: "buyer@example.invalid" }],
  };
  const client = { from(table: string) {
    const query = {
      select: () => query,
      in: (_: string, ids: unknown) => { calls.push({ table, ids }); return query; },
      order: () => query,
      then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: rows[table], error: null }).then(resolve),
    };
    return query;
  } };
  const [record] = await fetchAdminLeadListRecords(client as unknown as Parameters<typeof fetchAdminLeadListRecords>[0], ["request"]);
  assert.equal(record.summaryOnly, true);
  assert.equal(record.lead?.sharedSlotsAvailable, 2);
  assert.equal(record.contact?.firstName, "Fixture");
  assert.deepEqual(record.duplicateCheck, { status: "clear" });
  assert.deepEqual(record.purchases, [{ buyerCompany: "Fixture Company", buyerName: "Fixture Buyer", status: "paid" }]);
  assert.equal("pricing" in record, false);
  assert.equal("qualificationNotes" in record, false);
  assert.equal("consents" in record, false);
  assert.deepEqual(calls.slice(0, 4).map((call) => call.ids), [["request"], ["request"], ["request"], ["request"]]);
  assert.ok(calls.every((call) => call.table in rows));
});

test("empty pages do not query any table", async () => {
  const client = { from() { throw new Error("Unexpected query"); } };
  assert.deepEqual(await fetchAdminLeadListRecords(client as unknown as Parameters<typeof fetchAdminLeadListRecords>[0], []), []);
});
