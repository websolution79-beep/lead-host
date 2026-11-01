import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchAdminLeadPipeline } from "./lead-pipeline-records";

function fixture(count: number, failTable?: string) {
  const requests = Array.from({ length: count }, (_, i) => ({ id: `r${i}`, status: "to_verify", created_at: "2026-01-01", qualification_notes: `Nota ${i}`, review_pipeline_stage_id: i % 2 ? "stage2" : "stage1", first_worked_by_profile_id: "worker" }));
  const rows: Record<string, Record<string, unknown>[]> = {
    owner_requests: [...requests, { id: "sold", status: "published" }],
    owner_contacts: requests.map(r => ({ owner_request_id: r.id, first_name: r.id, phone: "3331234567" })),
    properties: requests.map(r => ({ owner_request_id: r.id, property_type: "Villa", city: "Roma", description: "Ricerca su tutto il testo" })),
    leads: [],
    profiles: [{ id: "worker", first_name: "Membro", last_name: "Fixture" }],
    team_members: [{ profile_id: "worker", badge_color: "#047857" }],
    admin_lead_pipeline_stages: [{ id: "stage1", name: "Nuovi Lead", color: "#2563EB", position: 0 }, { id: "stage2", name: "Non risponde", color: "#047857", position: 1 }],
    owner_request_operational_activity: [{ owner_request_id: "r0", last_activity_at: "2026-01-02", kind: "note_updated", source: "tracked" }],
  };
  const calls: { table: string; fields?: string; ids?: string[]; status?: string }[] = [];
  const client = { from(table: string) {
    assert.ok(table in rows, `Unexpected table: ${table}`);
    let data = rows[table];
    const call: typeof calls[number] = { table }; calls.push(call);
    const query = {
      select: (fields: string) => { call.fields = fields; return query; },
      eq: (key: string, value: string) => { call.status = value; data = data.filter(r => r[key] === value); return query; },
      in: (key: string, ids: string[]) => { call.ids = ids; data = data.filter(r => ids.includes(r[key] as string)); return query; },
      order: () => query,
      range: (from: number, to: number) => { data = data.slice(from, to + 1); return query; },
      then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data, error: failTable === table ? { code: "XX000", message: "Fixture failure" } : null }).then(resolve),
    };
    return query;
  } };
  return { client: client as unknown as Parameters<typeof fetchAdminLeadPipeline>[0], calls };
}

test("all operational leads, across SQL row pages and join batches, retain card data", async () => {
  const { client, calls } = fixture(205);
  const result = await fetchAdminLeadPipeline(client);
  assert.equal(result.records.length, 205);
  assert.equal(result.records[204].ownerRequestId, "r204");
  assert.equal(result.stages.length, 2);
  const record = result.records[0];
  assert.equal(record.qualificationNotes, "Nota 0");
  assert.equal(record.firstWorkedBy?.badgeColor, "#047857");
  assert.equal(record.contact?.phone, "3331234567");
  assert.equal(record.operationalActivity?.at, "2026-01-02");
  assert.equal("pricing" in record, false);
  assert.equal("consents" in record, false);
  assert.equal("purchases" in record, false);
  assert.ok(calls.filter(c => c.table === "owner_requests").every(c => c.status === "to_verify"));
  assert.ok(calls.every(c => !c.ids || c.ids.length <= 100));
});

test("empty pipeline retains columns without loading contact or commercial data", async () => {
  const { client, calls } = fixture(0);
  const result = await fetchAdminLeadPipeline(client);
  assert.equal(result.records.length, 0);
  assert.equal(result.stages.length, 2);
  assert.deepEqual(calls.map(c => c.table), ["owner_requests", "admin_lead_pipeline_stages"]);
});

test("failed required reads reject rather than show an apparently empty board", async () => {
  const { client } = fixture(1, "owner_contacts");
  await assert.rejects(fetchAdminLeadPipeline(client), { message: "Fixture failure" });
});

test("unavailable operational activity keeps its unavailable state, not a false last activity", async () => {
  const { client } = fixture(1, "owner_request_operational_activity");
  const result = await fetchAdminLeadPipeline(client);
  assert.equal(result.records[0].operationalActivity, undefined);
});
