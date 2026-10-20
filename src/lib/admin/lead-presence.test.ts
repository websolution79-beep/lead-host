import assert from "node:assert/strict";
import test from "node:test";
import { activeLeadViewers, LEAD_PRESENCE_HEARTBEAT_MS, LEAD_PRESENCE_TTL_MS, type LeadPresenceSnapshot } from "./lead-presence";

const serverNow = "2026-10-20T09:00:00Z";
const person = { profileId: "one", name: "Membro Uno", badgeColor: "#2563eb", expiresAt: "2026-10-20T09:03:00Z" };
const snapshot: LeadPresenceSnapshot = { status: "active", serverNow, participants: [person] };

test("heartbeat is 30 seconds and presence expires after 3 minutes without renewal", () => {
  assert.equal(LEAD_PRESENCE_HEARTBEAT_MS, 30000);
  assert.equal(LEAD_PRESENCE_TTL_MS, 180000);
  assert.equal(activeLeadViewers(snapshot, 0, 179999).length, 1);
  assert.equal(activeLeadViewers(snapshot, 0, 180000).length, 0);
});

test("server expiry is independent of client wall clock and uses remaining lifetime", () => {
  const partial = { ...snapshot, participants: [{ ...person, expiresAt: "2026-10-20T09:00:30Z" }] };
  assert.equal(activeLeadViewers(partial, 900000000, 900029999).length, 1);
  assert.equal(activeLeadViewers(partial, 900000000, 900030000).length, 0);
});

test("inactive, missing, duplicate and invalid presence data do not create ghost members", () => {
  assert.deepEqual(activeLeadViewers(null, 0, 0), []);
  assert.deepEqual(activeLeadViewers({ ...snapshot, status: "inactive" }, 0, 0), []);
  assert.equal(activeLeadViewers({ ...snapshot, participants: [person, person] }, 0, 0).length, 1);
  assert.equal(activeLeadViewers({ ...snapshot, participants: [{ ...person, expiresAt: "invalid" }] }, 0, 0).length, 0);
  assert.equal(activeLeadViewers({ ...snapshot, participants: [{ ...person, expiresAt: "2030-01-01" }] }, 0, 180000).length, 0);
});
