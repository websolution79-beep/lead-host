import assert from "node:assert/strict";
import test from "node:test";
import { readRowsInIdBatches } from "./batched-query";

test("reads large id collections in bounded batches", async () => {
  const receivedBatches: string[][] = [];
  const ids = Array.from({ length: 235 }, (_, index) => `id-${index}`);

  const rows = await readRowsInIdBatches(
    ids,
    async (batch) => {
      receivedBatches.push(batch);
      return { data: batch.map((id) => ({ id })), error: null };
    },
    100,
  );

  assert.deepEqual(receivedBatches.map((batch) => batch.length), [100, 100, 35]);
  assert.equal(rows.length, 235);
  assert.equal(rows[234]?.id, "id-234");
});

test("deduplicates ids and stops when a batch fails", async () => {
  let calls = 0;

  await assert.rejects(
    readRowsInIdBatches(
      ["one", "one", "two", "three"],
      async (batch) => {
        calls += 1;
        if (calls === 2) return { data: null, error: new Error("query failed") };
        return { data: batch.map((id) => ({ id })), error: null };
      },
      2,
    ),
    /query failed/,
  );

  assert.equal(calls, 2);
});
