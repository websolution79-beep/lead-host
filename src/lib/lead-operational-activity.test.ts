import test from "node:test";
import assert from "node:assert/strict";
import { compareLeadActivity, describeLeadActivity, detectLeadEditActivity, type LeadOperationalActivity } from "./lead-operational-activity";

const now = Date.parse("2026-10-20T08:00:00Z");
const activity = (days: number, source: LeadOperationalActivity["source"] = "tracked"): LeadOperationalActivity => ({ at: new Date(now - days * 86400000).toISOString(), kind: "note_updated", source });
const record = (days: number) => ({ createdAt: "2026-08-03T08:00:00Z", operationalActivity: activity(days) });

test("age thresholds are neutral before 3 days, amber from 3, red from 7", () => {
  assert.equal(describeLeadActivity(record(2.99), now).tone, "neutral");
  assert.equal(describeLeadActivity(record(3), now).tone, "warning");
  assert.equal(describeLeadActivity(record(6.99), now).tone, "warning");
  assert.equal(describeLeadActivity(record(7), now).tone, "danger");
  assert.equal(describeLeadActivity(record(1), now).age, "Fermo da 1 giorno");
  assert.equal(describeLeadActivity(record(5), now).age, "Fermo da 5 giorni");
});
test("missing storage and no recorded activity are distinct; arrival is not called last activity", () => {
  const unavailable = describeLeadActivity({ createdAt: record(1).createdAt }, now);
  assert.equal(unavailable.at, null); assert.equal(unavailable.age, null);
  const empty = describeLeadActivity({ createdAt: "2026-10-15T08:00:00Z", operationalActivity: null }, now);
  assert.equal(empty.at, null); assert.equal(empty.age, "Arrivato da 5 giorni");
  assert.equal(empty.label, "Nessuna attivit\u00e0 registrata");
  assert.equal(describeLeadActivity({ ...record(1), operationalActivity: activity(1, "audit") }, now).historical, true);
});
test("oldest activity first with arrival fallback; original record ordering is not mutated", () => {
  const recent = record(1), old = record(9), empty = { createdAt: "2026-08-03T08:00:00Z", operationalActivity: null };
  const original = [recent, old, empty];
  assert.deepEqual([...original].sort(compareLeadActivity), [empty, old, recent]);
  assert.equal(original[0], recent);
});
test("technical values and unchanged form saves do not count as work", () => {
  const before = { request: { qualification_notes: null, owner_verified: false, subletting_available: false, duplicate_check: { checked_at: "old" }, normalized_payload: {} }, contact: { first_name: "Mario", phone: "123" }, property: { city: "Roma", current_status: ["a", "b"], requested_services: null }, lead: null };
  assert.equal(detectLeadEditActivity(before, {}), null);
  assert.equal(detectLeadEditActivity(before, { qualificationNotes: null, contact: { firstName: "Mario", phone: "123" }, property: { city: "Roma", currentStatus: ["b", "a"], requestedServices: [] }, marketplace: { ownerVerified: false, sublettingAvailable: false }, consents: { privacy: false } }), null);
  assert.equal(detectLeadEditActivity(before, { qualificationNotes: "Telefonata: nessuna risposta" }), "note_updated");
  assert.equal(detectLeadEditActivity(before, { contact: { phone: "456" } }), "information_updated");
  assert.equal(detectLeadEditActivity(before, { property: { city: "Milano" } }), "information_updated");
  assert.equal(detectLeadEditActivity(before, { marketplace: { ownerVerified: true } }), "information_updated");
  assert.equal(detectLeadEditActivity(before, { consents: { privacy: true } }), "information_updated");
});
test("clearing notes is a real change, timestamps and unrelated metadata are not", () => {
  const before = { request: { qualification_notes: "Nota precedente", updated_at: "today" }, contact: null, property: null, lead: null };
  assert.equal(detectLeadEditActivity(before, { qualificationNotes: null }), "note_updated");
  assert.equal(detectLeadEditActivity(before, { qualificationNotes: "Nota precedente" }), null);
  assert.equal(detectLeadEditActivity({ ...before, lead: { title: "Casa", shared_price_cents: 2900 } }, { marketplace: { title: "Casa", sharedPriceCents: 2900 } }), null);
  assert.equal(detectLeadEditActivity({ ...before, lead: { title: "Casa" } }, { marketplace: { title: "Villa" } }), "information_updated");
});
test("invalid and future dates do not create negative ages or errors", () => {
  assert.equal(describeLeadActivity({ createdAt: "invalid", operationalActivity: null }, now).days, null);
  assert.equal(describeLeadActivity(record(-1), now).days, 0);
});
