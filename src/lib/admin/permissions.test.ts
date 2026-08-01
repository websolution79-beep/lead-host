import assert from "node:assert/strict";
import test from "node:test";
import {
  getAdminApiAccessLevel,
  getAdminApiPermissions,
  getAdminPagePermission,
  getFirstAllowedAdminRoute,
  hasAdminPermission,
} from "@/lib/admin/permissions";

test("maps admin pages without letting /admin swallow nested routes", () => {
  assert.equal(getAdminPagePermission("/admin"), "dashboard");
  assert.equal(getAdminPagePermission("/admin/marketplace"), "marketplace");
  assert.equal(
    getAdminPagePermission("/admin/marketplace/example"),
    "marketplace",
  );
  assert.equal(getAdminPagePermission("/admin/leads"), "leads");
  assert.equal(getAdminPagePermission("/admin/leads/example"), "leads");
  assert.equal(getAdminPagePermission("/admin/acquisizione/meta"), "acquisition");
  assert.equal(getAdminPagePermission("/admin/profilo"), undefined);
  assert.equal(getAdminPagePermission("/admin/team"), undefined);
});

test("uses marketplace as the first route for a role with marketplace access", () => {
  assert.equal(
    getFirstAllowedAdminRoute({ marketplace: "read", leads: "read" }),
    "/admin/marketplace",
  );
});

test("maps admin APIs to the expected permissions", () => {
  assert.deepEqual(getAdminApiPermissions("/api/admin/leads/summary"), ["leads"]);
  assert.deepEqual(getAdminApiPermissions("/api/admin/reports"), ["support"]);
  assert.deepEqual(getAdminApiPermissions("/api/admin/analytics"), [
    "dashboard",
    "analytics",
  ]);
  assert.deepEqual(getAdminApiPermissions("/api/admin/team"), []);
  assert.deepEqual(getAdminApiPermissions("/api/admin/unknown"), []);
});

test("derives read and write access from HTTP methods", () => {
  assert.equal(getAdminApiAccessLevel("GET"), "read");
  assert.equal(getAdminApiAccessLevel("HEAD"), "read");
  assert.equal(getAdminApiAccessLevel("POST"), "write");
  assert.equal(getAdminApiAccessLevel("PATCH"), "write");
  assert.equal(getAdminApiAccessLevel("DELETE"), "write");
});

test("enforces access levels and chooses the first allowed route", () => {
  const permissions = {
    leads: "read" as const,
    support: "write" as const,
  };

  assert.equal(hasAdminPermission(permissions, "leads", "read"), true);
  assert.equal(hasAdminPermission(permissions, "leads", "write"), false);
  assert.equal(hasAdminPermission(permissions, "support", "read"), true);
  assert.equal(hasAdminPermission(permissions, "support", "write"), true);
  assert.equal(getFirstAllowedAdminRoute(permissions), "/admin/leads");
});
