import test from "node:test";
import assert from "node:assert/strict";
import { canManageCalendarEntry } from "./team-calendar-access";

test("superadmins manage any calendar member", () => {
  assert.equal(canManageCalendarEntry({ isSuperAdmin: true, memberId: null }, "other-member"), true);
});
test("team members manage only their own calendar entries", () => {
  const viewer = { isSuperAdmin: false, memberId: "member-a" };
  assert.equal(canManageCalendarEntry(viewer, "member-a"), true);
  assert.equal(canManageCalendarEntry(viewer, "member-b"), false);
});
test("missing member identity grants no write access", () => {
  assert.equal(canManageCalendarEntry({ isSuperAdmin: false, memberId: null }, "member-a"), false);
});
