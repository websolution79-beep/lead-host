import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchLeadListPage, leadListFilterSchema } from "./lead-list-page";

const id = "00000000-0000-4000-8000-000000000001";
const stats = { waitingCompletion: 0, duplicates: 4, newLeads: 91, pending: 18,
  prime: 0, published: 21, sold: 93, expired: 85, rejected: 176 };

test("pipeline is not an opt-in list filter", () => {
  assert.equal(leadListFilterSchema.safeParse("new").success, false);
  assert.equal(leadListFilterSchema.safeParse("sold").success, true);
});

test("full-archive search and pagination are passed to SQL, not applied after limiting", async () => {
  const result = await fetchLeadListPage({ rpc: async (name: string, args: unknown) => {
    assert.equal(name, "admin_lead_list_page_v1");
    assert.deepEqual(args, { p_filter: "sold", p_search: "Milano", p_page: 2, p_page_size: 25 });
    return { error: null, data: { ownerRequestIds: [id], total: 63, stats } };
  } }, new URLSearchParams("filter=sold&search=%20Milano%20&page=2"));
  assert.equal(result?.pagination.totalPages, 3);
  assert.equal(result?.pagination.total, 63);
  assert.deepEqual(result?.ownerRequestIds, [id]);
  assert.deepEqual(result?.stats, stats);
});

test("missing migration supports rolling deployment but timeout never causes archive reload", async () => {
  assert.equal(await fetchLeadListPage({ rpc: async () => ({ error: { code: "PGRST202" } }) }, new URLSearchParams("filter=all")), null);
  const error = { code: "57014" };
  await assert.rejects(fetchLeadListPage({ rpc: async () => ({ error }) }, new URLSearchParams("filter=all")), (actual) => actual === error);
});

test("invalid IDs or a larger-than-requested page fail explicitly", async () => {
  for (const ownerRequestIds of [["invalid"], [id, id]]) {
    await assert.rejects(fetchLeadListPage({ rpc: async () => ({ error: null, data: { ownerRequestIds, total: 2, stats } }) }, new URLSearchParams("filter=all&pageSize=1")), /non valida/);
  }
});
