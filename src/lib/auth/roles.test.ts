import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultRoute } from "@/lib/auth/roles";

test("routes Property Managers to the marketplace", () => {
  assert.equal(getDefaultRoute(["property_manager"]), "/app/marketplace");
});

test("routes Super Admins and Team members to the admin area", () => {
  assert.equal(getDefaultRoute(["super_admin"]), "/admin");
  assert.equal(getDefaultRoute(["team_member"]), "/admin");
});
