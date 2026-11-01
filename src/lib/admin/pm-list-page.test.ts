import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchPmListPage } from "./pm-list-page";

test("list page sends full-archive filters to SQL and preserves response contract", async () => {
  const client = { rpc: async (name: string, args: Record<string, unknown>) => {
    assert.equal(name, "admin_pm_list_page_v1");
    assert.deepEqual(args, { p_search: "Milano", p_managed_properties: "one_to_three", p_page: 2, p_page_size: 25 });
    return { error: null, data: {
      total: 63, stats: { total: 953, active: 916, suspended: 37, prime: 8 },
      propertyManagers: [{ profileId: "fixture", managedPropertiesRange: "one_to_three", managedPropertiesCount: 3, walletBalanceCents: 5000 }],
    } };
  } };
  const result = await fetchPmListPage(client, new URLSearchParams("page=2"), "Milano", "one_to_three");
  assert.equal(result?.pagination.totalPages, 3);
  assert.equal(result?.stats.total, 953);
  assert.equal(result?.propertyManagers[0].managedPropertiesLabel, "Gestisco da 1 a 3 immobili");
  assert.equal("managedPropertiesCount" in result!.propertyManagers[0], false);
});

test("rolling deployment falls back only when the SQL function is absent", async () => {
  for (const code of ["PGRST202", "42883"]) {
    assert.equal(await fetchPmListPage({ rpc: async () => ({ error: { code }, data: null }) }, new URLSearchParams(), ""), null);
  }
  const error = { code: "57014", message: "statement timeout" };
  await assert.rejects(fetchPmListPage({ rpc: async () => ({ error, data: null }) }, new URLSearchParams(), ""), (actual) => actual === error);
});

test("page size stays bounded; malformed data cannot look like an empty archive", async () => {
  const client = { rpc: async (_: string, args: Record<string, unknown>) => {
    assert.equal(args.p_page_size, 50);
    return { error: null, data: {} };
  } };
  await assert.rejects(fetchPmListPage(client, new URLSearchParams("pageSize=1000"), ""), /non valida/);
});
