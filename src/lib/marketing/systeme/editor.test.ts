import assert from "node:assert/strict";
import test from "node:test";
import { addDiscoveredBindings, duplicateSystemeFlow, initialSystemeFlowBindings, knownFieldsForFlow, validateSystemeEditorFlow } from "./editor";
import type { SystemeFlow, SystemeFlowSnapshot, SystemeKnownField } from "./flows";

const id = "10000000-0000-4000-8000-000000000001";
const otherId = "10000000-0000-4000-8000-000000000002";
const page = "https://example.test/milano";
function flow(overrides: Partial<SystemeFlow> = {}): SystemeFlow {
  return { id, name: "Milano", enabled: false, importMode: "selected_pages", allowedPageUrls: [page], destinationStageId: null,
    bindings: initialSystemeFlowBindings(), ...overrides };
}
function known(sourceSlug: string, sourcePageUrl = page): SystemeKnownField {
  return { sourceSlug, sourcePageUrl, fieldLabel: sourceSlug, firstSeenAt: "2026-10-15T10:00:00Z", lastSeenAt: "2026-10-15T10:00:00Z" };
}

test("editor discovery respects selected pages, paused reservations and per-page field schemas", () => {
  const rows = [known("city"), known("citta_roma", "https://example.test/roma"), known("phone", ""), known("email")];
  assert.deepEqual(knownFieldsForFlow(flow({ allowedPageUrls: [`${page}/?utm_source=meta`] }), rows, []).map((field) => field.sourceSlug), ["city", "email"]);
  const fallback = flow({ id: otherId, importMode: "all", allowedPageUrls: [] });
  assert.deepEqual(knownFieldsForFlow(fallback, rows, [flow(), fallback]).map((field) => field.sourceSlug), ["citta_roma", "phone"]);
});

test("adding discovered sources preserves every manual mapping and ignores unknown fields", () => {
  const manual = [{ sourceSlug: "custom_name", targetField: "full_name" as const, additionalLabel: null }];
  const mapped = addDiscoveredBindings(manual, [known("first_name"), known("email"), known("question"), known("custom_name")]);
  assert.deepEqual(mapped[0], manual[0]);
  assert.equal(mapped.find((binding) => binding.sourceSlug === "first_name")?.targetField, "ignore");
  assert.equal(mapped.find((binding) => binding.sourceSlug === "email")?.targetField, "email");
  assert.equal(mapped.find((binding) => binding.sourceSlug === "question")?.targetField, "ignore");
  assert.deepEqual(addDiscoveredBindings(mapped, [known("email")]), mapped);
  assert.equal(manual.length, 1);
});

test("initial detected bindings prefer the full name and stay within 200 associations", () => {
  const mapped = initialSystemeFlowBindings([known("full_name"), known("first_name"), known("last_name"), known("email")]);
  assert.equal(mapped.find((binding) => binding.targetField === "full_name")?.sourceSlug, "full_name");
  assert.ok(!mapped.some((binding) => ["first_name", "last_name"].includes(binding.targetField)));
  assert.equal(addDiscoveredBindings([], Array.from({ length: 250 }, (_, index) => known(`field_${index}`))).length, 200);
});

test("duplicate creates an isolated paused draft with unique name, never a second fallback", () => {
  const original = flow({ enabled: true });
  const copy = duplicateSystemeFlow(original, otherId, [original, flow({ id: otherId, name: "Milano - copia" })]);
  assert.equal(copy.name, "Milano - copia 2");
  assert.equal(copy.enabled, false);
  assert.deepEqual(copy.allowedPageUrls, original.allowedPageUrls);
  copy.bindings[0].sourceSlug = "changed";
  assert.notEqual(copy.bindings[0].sourceSlug, original.bindings[0].sourceSlug);
  const fallbackCopy = duplicateSystemeFlow(flow({ importMode: "all", allowedPageUrls: [] }), otherId, []);
  assert.equal(fallbackCopy.importMode, "selected_pages");
  assert.deepEqual(fallbackCopy.allowedPageUrls, [""]);
});

test("draft conflicts are caught without mutating the existing or first legacy configuration", () => {
  const original = flow();
  const snapshot: SystemeFlowSnapshot = { routingMode: "flows", enabled: false, flows: [original],
    configurationToken: "a".repeat(32), configurationRevision: "0", discoveryExpiresAt: null, updatedAt: "2026-10-15T10:00:00Z" };
  assert.equal(validateSystemeEditorFlow(duplicateSystemeFlow(original, otherId, [original]), snapshot).success, false);
  assert.equal(validateSystemeEditorFlow(flow({ id: otherId, name: "Roma", allowedPageUrls: ["https://example.test/roma"] }), snapshot).success, true);
  const legacy = { ...snapshot, routingMode: "legacy" as const, flows: [flow({ enabled: true, bindings: [] })] };
  assert.equal(validateSystemeEditorFlow(flow({ id: otherId, name: "Roma", allowedPageUrls: ["https://example.test/roma"] }), legacy).success, true);
  assert.equal(legacy.flows[0].enabled, true);
});
