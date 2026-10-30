import assert from "node:assert/strict";
import { test } from "node:test";
import { boundedMap } from "./bounded-map";

test("bulk notifications keep concurrency bounded and preserve every result", async () => {
  let active = 0;
  let peak = 0;
  const values = Array.from({ length: 888 }, (_, index) => index);
  const result = await boundedMap(values, 3, async (value) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    return value * 2;
  });
  assert.equal(peak, 3);
  assert.equal(active, 0);
  assert.deepEqual(result, values.map((value) => value * 2));
});

test("empty inputs perform no work and invalid limits are rejected", async () => {
  assert.deepEqual(await boundedMap([], 3, async () => { throw Error("unexpected"); }), []);
  await assert.rejects(boundedMap([1], 0, async (x) => x), RangeError);
});

test("errors are surfaced only after other workers have stopped", async () => {
  let active = 0;
  await assert.rejects(boundedMap([1, 2, 3], 2, async (value) => {
    if (value === 1) throw Error("fixture failure");
    active++;
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return value;
  }), /fixture failure/);
  assert.equal(active, 0);
});
