import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchLeadActivities } from "./lead-activity-records";

function client(result: unknown) {
  return { from: () => ({ select: () => ({ in: async () => result }) }) } as unknown as SupabaseClient<Database>;
}

test("missing activity storage does not break lead loading", async () => {
  for (const code of ["42P01", "PGRST205"]) {
    const result = await fetchLeadActivities(client({ data: null, error: { code } }), ["lead"]);
    assert.equal(result.available, false);
    assert.equal(result.byRequest.size, 0);
  }
});

test("empty and historical activity results preserve the distinction from unavailable storage", async () => {
  const empty = await fetchLeadActivities(client({ data: [], error: null }), ["lead"]);
  assert.equal(empty.available, true);
  assert.equal(empty.byRequest.size, 0);
  const historic = await fetchLeadActivities(client({ data: [{ owner_request_id: "lead", last_activity_at: "2026-10-01T09:00:00Z", kind: "pipeline_move", source: "audit" }], error: null }), ["lead"]);
  assert.deepEqual(historic.byRequest.get("lead"), { at: "2026-10-01T09:00:00Z", kind: "pipeline_move", source: "audit" });
  const noIds = await fetchLeadActivities({} as SupabaseClient<Database>, []);
  assert.equal(noIds.available, true);
});
