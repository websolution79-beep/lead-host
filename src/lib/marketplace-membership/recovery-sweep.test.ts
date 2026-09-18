import assert from "node:assert/strict";
import test from "node:test";
import { recoverMarketplaceRenewals } from "./recovery-sweep";

test("recovery advances by ID and isolates a failed subscriber", async () => {
  const cursors: (string | null)[] = [];
  const visited: string[] = [];
  const errors: string[] = [];
  const result = await recoverMarketplaceRenewals({
    loadPage: async cursor => {
      cursors.push(cursor);
      return cursor === null ? [{ id: "a", profile_id: "first" }, { id: "b", profile_id: "failed" }]
        : cursor === "b" ? [{ id: "c", profile_id: "last" }] : [];
    },
    reconcile: async id => { visited.push(id); if (id === "failed") throw new Error("Stripe unavailable"); },
    onError: id => { errors.push(id); },
  });
  assert.deepEqual(result, { checked: 3, failed: 1 });
  assert.deepEqual(cursors, [null, "b", "c"]);
  assert.deepEqual(visited, ["first", "failed", "last"]);
  assert.deepEqual(errors, ["b"]);
});

test("recovery propagates database failures instead of reporting success", async () => {
  await assert.rejects(recoverMarketplaceRenewals({
    loadPage: async () => { throw new Error("Database unavailable"); },
    reconcile: async () => { assert.fail("No Stripe calls expected"); },
    onError: () => {},
  }), /Database unavailable/);
});

test("empty recovery does not perform writes", async () => {
  assert.deepEqual(await recoverMarketplaceRenewals({ loadPage: async () => [],
    reconcile: async () => { assert.fail("Unexpected write"); }, onError: () => {},
  }), { checked: 0, failed: 0 });
});
