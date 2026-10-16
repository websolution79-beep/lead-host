import assert from "node:assert/strict";
import test from "node:test";
import { leadAssigneeColors } from "./lead-assignment-types";

test("team colors retain the actual accent and readable text", () => {
  assert.equal(leadAssigneeColors("#00FF00").accent, "#00FF00");
  assert.notEqual(leadAssigneeColors("#00FF00").text.toUpperCase(), "#00FF00");
  assert.equal(leadAssigneeColors("#047857").text.toUpperCase(), "#047857");
});

test("missing or invalid member colors cannot inject styles", () => {
  for (const value of [null, undefined, "red", "#fff", "url(https://example.test)"]) {
    assert.equal(leadAssigneeColors(value).accent, "#64748B");
  }
});
