import assert from "node:assert/strict";
import test from "node:test";
import { mapSystemeFlowContact, parseSystemeFlowEnvelope, planSystemeFlowImport, suggestSystemeFieldBindings, systemeDiscoveryMetadata } from "./flow-payload";
import { selectSystemeFlow, systemeFlowListSchema, systemeFlowSchema, type SystemeFieldBinding, type SystemeFlow } from "./flows";
import { parseSystemeOptIn } from "./payload";

const milanId = "10000000-0000-4000-8000-000000000001";
const romeId = "10000000-0000-4000-8000-000000000002";
const fallbackId = "10000000-0000-4000-8000-000000000003";
const milanStage = "20000000-0000-4000-8000-000000000001";
const romeStage = "20000000-0000-4000-8000-000000000002";
const milanUrl = "https://landing.example.test/Milano";
const romeUrl = "https://landing.example.test/Roma";

function binding(sourceSlug: string, targetField: SystemeFieldBinding["targetField"], additionalLabel: string | null = null): SystemeFieldBinding {
  return { sourceSlug, targetField, additionalLabel };
}

function flow(overrides: Partial<SystemeFlow> = {}): SystemeFlow {
  return systemeFlowSchema.parse({
    id: milanId, name: "Lead Milano", enabled: true, importMode: "selected_pages",
    allowedPageUrls: [milanUrl], destinationStageId: milanStage,
    bindings: [binding("first_name", "first_name"), binding("email", "email")], ...overrides,
  });
}

function envelope(fields: { slug: string; value?: string | null; fieldName?: string }[] = [], overrides: Record<string, unknown> = {}) {
  const parsed = parseSystemeFlowEnvelope(JSON.stringify({ contact: {
    id: 123, email: "MARIO@example.test", sourceURL: `${milanUrl}/?utm_campaign=uno#form`,
    fields: [{ slug: "first_name", fieldName: "Nome", value: "Mario" }, ...fields], ...overrides,
  } }));
  assert.ok(parsed);
  return parsed;
}

test("flow settings normalize complete URLs and reserve pages across paused flows", () => {
  const milan = flow({ allowedPageUrls: ["https://LANDING.EXAMPLE.TEST:443/Milano/?utm_source=meta#form"] });
  assert.deepEqual(milan.allowedPageUrls, [milanUrl]);
  assert.equal(systemeFlowListSchema.safeParse([milan, flow({ id: romeId, name: "Duplicato", enabled: false })]).success, false);
  assert.equal(systemeFlowSchema.safeParse({ ...milan, allowedPageUrls: [milanUrl, `${milanUrl}/?utm_campaign=due`] }).success, false);
  for (const url of ["Milano", "javascript:alert(1)", "https://user:pass@example.test", ""]) {
    assert.equal(systemeFlowSchema.safeParse({ ...milan, allowedPageUrls: [url] }).success, false);
  }
});

test("configuration rejects duplicate flow IDs, names and fallback even when paused", () => {
  const first = flow();
  assert.equal(systemeFlowListSchema.safeParse([first, flow({ name: "Altra pagina", allowedPageUrls: [romeUrl] })]).success, false);
  assert.equal(systemeFlowListSchema.safeParse([first, flow({ id: romeId, name: " lead milano ", allowedPageUrls: [romeUrl] })]).success, false);
  const fallback = flow({ id: fallbackId, name: "Generale", importMode: "all", allowedPageUrls: [] });
  assert.equal(systemeFlowListSchema.safeParse([fallback, { ...fallback, id: romeId, name: "Altro", enabled: false }]).success, false);
  assert.equal(systemeFlowSchema.safeParse({ ...first, importMode: "all" }).success, false);
  assert.equal(systemeFlowSchema.safeParse({ ...first, allowedPageUrls: [] }).success, false);
  assert.equal(systemeFlowListSchema.safeParse([first, fallback]).success, true);
});

test("flow lists have a bounded size and may be empty while imports are paused", () => {
  assert.equal(systemeFlowListSchema.safeParse([flow()]).success, true);
  assert.equal(systemeFlowListSchema.safeParse([]).success, true);
  assert.equal(systemeFlowListSchema.safeParse(Array.from({ length: 21 }, (_, index) => flow({
    id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`, name: `Flusso ${index}`, allowedPageUrls: [`https://example.test/${index}`],
  }))).success, false);
});

test("enabled mappings require name/email and cannot target sensitive or operational CRM fields", () => {
  const valid = flow();
  for (const target of ["profile_id", "notes", "stage_id", "wallet", "next_follow_up_at", "position"]) {
    assert.equal(systemeFlowSchema.safeParse({ ...valid, bindings: [...valid.bindings, { sourceSlug: "custom", targetField: target, additionalLabel: null }] }).success, false);
  }
  assert.equal(systemeFlowSchema.safeParse({ ...valid, bindings: [] }).success, false);
  assert.equal(systemeFlowSchema.safeParse({ ...valid, enabled: false, bindings: [] }).success, true);
  assert.equal(systemeFlowSchema.safeParse({ ...valid, bindings: [binding("first_name", "first_name")] }).success, false);
  assert.equal(systemeFlowSchema.safeParse({ ...valid, bindings: [binding("email", "email")] }).success, false);
  assert.equal(systemeFlowSchema.safeParse({ ...valid, profileId: romeId }).success, false);
});

test("bindings reject duplicate normalized sources, destinations, labels and ambiguous name mapping", () => {
  const valid = flow();
  for (const extra of [binding(" FIRST_NAME ", "city"), binding("alt_name", "first_name"), binding("name", "full_name")]) {
    assert.equal(systemeFlowSchema.safeParse({ ...valid, bindings: [...valid.bindings, extra] }).success, false);
  }
  const extras = [binding("question_1", "additional", "Zona"), binding("question_2", "additional", " zona ")];
  assert.equal(systemeFlowSchema.safeParse({ ...valid, bindings: [...valid.bindings, ...extras] }).success, false);
  assert.equal(systemeFlowSchema.safeParse({ ...valid, bindings: [...valid.bindings, binding("question", "additional")] }).success, false);
  assert.equal(systemeFlowSchema.safeParse({ ...valid, bindings: [...valid.bindings, binding("city", "city", "Citta")] }).success, false);
  assert.equal(systemeFlowSchema.safeParse({ ...valid, bindings: [...valid.bindings, binding("q1", "ignore"), binding("q2", "ignore")] }).success, true);
});

test("routing chooses Milan/Rome destination stages ahead of an order-independent fallback", () => {
  const milan = flow();
  const rome = flow({ id: romeId, name: "Lead Roma", allowedPageUrls: [romeUrl], destinationStageId: romeStage });
  const fallback = flow({ id: fallbackId, name: "Altre pagine", importMode: "all", allowedPageUrls: [], destinationStageId: null });
  const flows = systemeFlowListSchema.parse([fallback, rome, milan]);
  assert.equal(selectSystemeFlow(flows, `${milanUrl}/?utm_campaign=due#form`)?.destinationStageId, milanStage);
  assert.equal(selectSystemeFlow(flows, romeUrl)?.destinationStageId, romeStage);
  assert.equal(selectSystemeFlow(flows, "https://other.example.test/Milano")?.id, fallbackId);
  assert.equal(selectSystemeFlow(flows, "https://landing.example.test/milano")?.id, fallbackId);
  assert.equal(selectSystemeFlow(flows, null)?.id, fallbackId);
});

test("a paused specific flow never falls through to the enabled general flow", () => {
  const paused = flow({ enabled: false });
  const fallback = flow({ id: fallbackId, name: "Generale", importMode: "all", allowedPageUrls: [] });
  const planned = planSystemeFlowImport(true, [fallback, paused], envelope());
  assert.equal(planned.flow?.id, milanId);
  assert.equal(planned.rejectionReason, "flow_paused");
  assert.equal(planned.mapped, null);
  assert.equal(planSystemeFlowImport(false, [fallback, flow()], envelope()).rejectionReason, "connection_disabled");
  assert.equal(planSystemeFlowImport(true, [flow()], envelope([], { sourceURL: romeUrl })).rejectionReason, "page_filtered");
  assert.equal(planSystemeFlowImport(true, [flow()], envelope([], { sourceURL: null })).rejectionReason, "page_filtered");
  assert.equal(planSystemeFlowImport(true, [flow()], null).rejectionReason, "invalid_payload");
});

test("discovery accepts a nameless envelope and returns metadata without submitted values", () => {
  const parsed = envelope([{ slug: " zona_custom ", fieldName: "Zona", value: "Sensitive submitted answer" }], { fields: [
    { slug: " zona_custom ", fieldName: "Zona", value: "Sensitive submitted answer" },
  ] });
  assert.equal(mapSystemeFlowContact(parsed, flow()).rejectionReason, "missing_name");
  const metadata = systemeDiscoveryMetadata(parsed);
  assert.deepEqual(metadata, [
    { sourcePageUrl: milanUrl, sourceSlug: "zona_custom", fieldLabel: "Zona" },
    { sourcePageUrl: milanUrl, sourceSlug: "email", fieldLabel: "Email" },
  ]);
  const serialized = JSON.stringify(metadata);
  assert.ok(!serialized.includes("Sensitive submitted answer"));
  assert.ok(!serialized.includes("MARIO@example.test"));
  assert.ok(!serialized.includes("externalId"));
});

test("the envelope rejects malformed, oversized and duplicate fields without throwing", () => {
  for (const raw of ["invalid", "null", "{}", '{"contact":{"id":9007199254740992}}', JSON.stringify({ contact: { id: 1, fields: [{ slug: " A ", value: "x" }, { slug: "a", value: "y" }] } }), JSON.stringify({ contact: { id: 1, fields: [{ slug: "" }] } })]) {
    assert.equal(parseSystemeFlowEnvelope(raw), null);
  }
  assert.equal(parseSystemeFlowEnvelope(" ".repeat(256 * 1024 + 1)), null);
  assert.equal(parseSystemeFlowEnvelope(JSON.stringify({ contact: { id: 1, fields: Array.from({ length: 201 }, (_, index) => ({ slug: `f${index}` })) } })), null);
  assert.ok(parseSystemeFlowEnvelope(JSON.stringify({ contact: { id: 1, fields: [{ slug: "x", value: "x".repeat(5001) }] } })));
  assert.equal(parseSystemeFlowEnvelope(JSON.stringify({ contact: { id: 1, fields: [{ slug: "x", value: { nested: "no" } }] } })), null);
});

test("custom source names and email are validated after explicit per-flow mapping", () => {
  const parsed = envelope([], { email: null, fields: [
    { slug: "nome_proprietario", value: "Anna Rossi" }, { slug: "email_lavoro", value: "ANNA@example.test" },
    { slug: "localita", value: "Milano" },
  ] });
  const milan = flow({ bindings: [binding("nome_proprietario", "full_name"), binding("email_lavoro", "email"), binding("localita", "city")] });
  const mapped = mapSystemeFlowContact(parsed, milan);
  assert.equal(mapped.rejectionReason, null);
  assert.equal(mapped.contact?.full_name, "Anna Rossi");
  assert.equal(mapped.contact?.email, "anna@example.test");
  assert.equal(mapped.contact?.city, "Milano");
  assert.deepEqual(mapped.warnings, []);
  const rome = flow({ id: romeId, name: "Roma", allowedPageUrls: [romeUrl], bindings: [binding("nome_proprietario", "full_name"), binding("email_lavoro", "email"), binding("localita", "additional", "Zona preferita")] });
  const other = mapSystemeFlowContact(parsed, rome);
  assert.equal(other.contact?.city, null);
  assert.equal(other.additionalAnswers[0]?.label, "Zona preferita");
});

test("suggested aliases prefer full name and one source per destination without activating unknown fields", () => {
  const parsed = envelope([
    { slug: "name", value: "Mario Rossi" }, { slug: "last_name", value: "Rossi" },
    { slug: "phone_number", value: "123" }, { slug: "phone", value: "456" }, { slug: "custom_field", value: "private answer" },
  ]);
  const suggested = suggestSystemeFieldBindings(parsed);
  assert.ok(suggested.some((entry) => entry.targetField === "full_name" && entry.sourceSlug === "name"));
  assert.ok(!suggested.some((entry) => ["first_name", "last_name"].includes(entry.targetField)));
  assert.deepEqual(suggested.filter((entry) => entry.targetField === "phone"), [binding("phone_number", "phone")]);
  assert.ok(!suggested.some((entry) => entry.sourceSlug === "custom_field"));
  assert.equal(systemeFlowSchema.safeParse({ ...flow(), bindings: suggested }).success, true);
  assert.equal(mapSystemeFlowContact(parsed, flow({ bindings: suggested })).contact?.full_name, "Mario Rossi");
});

test("explicit ignore and unconfigured fields cannot silently populate CRM fields", () => {
  const parsed = envelope([{ slug: "city", value: "Roma" }, { slug: "region", value: "Lazio" }]);
  const mapped = mapSystemeFlowContact(parsed, flow({ bindings: [...flow().bindings, binding("city", "ignore")] }));
  assert.equal(mapped.contact?.city, null);
  assert.equal(mapped.contact?.region, null);
  assert.ok(!mapped.warnings.some((entry) => entry.field === "city"));
  assert.deepEqual(mapped.warnings, [{ field: "region", code: "unmapped_field" }]);
});

test("canonical Systeme.io email is not shadowed by a same-slug custom field", () => {
  const parsed = envelope([{ slug: "email", value: "other@example.test" }]);
  assert.equal(mapSystemeFlowContact(parsed, flow()).contact?.email, "mario@example.test");
});

test("missing or invalid required data blocks the contact and additional answers with value-free warnings", () => {
  const configured = flow({ bindings: [...flow().bindings, binding("private", "additional", "Informazione")] });
  for (const [overrides, reason] of [
    [{ fields: [{ slug: "private", value: "secret" }] }, "missing_name"],
    [{ email: "" }, "missing_email"],
    [{ email: "not-an-email" }, "invalid_email"],
  ] as const) {
    const mapped = mapSystemeFlowContact(envelope([{ slug: "private", value: "secret" }], overrides), configured);
    assert.equal(mapped.rejectionReason, reason);
    assert.equal(mapped.contact, null);
    assert.deepEqual(mapped.additionalAnswers, []);
    assert.ok(mapped.warnings.every((entry) => Object.keys(entry).sort().join(",") === "code,field"));
    assert.ok(!JSON.stringify(mapped.warnings).includes("secret"));
    assert.ok(!JSON.stringify(mapped.warnings).includes("not-an-email"));
  }
});

test("name parts compose deterministically and full names are not inferred from arbitrary fields", () => {
  const configured = flow({ bindings: [...flow().bindings, binding("surname", "last_name")] });
  assert.equal(mapSystemeFlowContact(envelope([{ slug: "surname", value: "Rossi" }]), configured).contact?.full_name, "Mario Rossi");
  const full = flow({ bindings: [binding("custom_name", "full_name"), binding("email", "email")] });
  assert.equal(mapSystemeFlowContact(envelope(), full).rejectionReason, "missing_name");
});

test("numeric property fields accept bounded integers including zero and reject partial/decimal coercion", () => {
  const configured = flow({ bindings: [...flow().bindings, binding("rooms", "bedrooms"), binding("baths", "bathrooms"), binding("sqm", "area_sqm")] });
  const valid = mapSystemeFlowContact(envelope([{ slug: "rooms", value: "0" }, { slug: "baths", value: "2" }, { slug: "sqm", value: "105" }]), configured);
  assert.equal(valid.contact?.bedrooms, 0);
  assert.equal(valid.contact?.bathrooms, 2);
  assert.equal(valid.contact?.area_sqm, 105);
  for (const value of ["3 camere", "1.5", "1,5", "1e2", "0x10", "-1", "100001"]) {
    const mapped = mapSystemeFlowContact(envelope([{ slug: "rooms", value }, { slug: "baths", value }, { slug: "sqm", value }]), configured);
    assert.equal(mapped.rejectionReason, null);
    assert.equal(mapped.contact?.bedrooms, null);
    assert.equal(mapped.contact?.bathrooms, null);
    assert.equal(mapped.contact?.area_sqm, null);
    assert.equal(mapped.warnings.filter((entry) => entry.code === "invalid_number").length, 3);
  }
});

test("optional text respects CRM bounds, preserves Unicode and warns instead of rejecting the lead", () => {
  const configured = flow({ bindings: [...flow().bindings, binding("city", "city"), binding("phone", "phone")] });
  const mapped = mapSystemeFlowContact(envelope([{ slug: "city", value: "x".repeat(200) }, { slug: "phone", value: "1".repeat(100) }]), configured);
  assert.equal(mapped.contact?.city?.length, 120);
  assert.equal(mapped.contact?.phone?.length, 50);
  assert.equal(mapped.rejectionReason, null);
  assert.deepEqual(mapped.warnings, [{ field: "phone", code: "value_truncated" }, { field: "city", code: "value_truncated" }]);
  const unicode = mapSystemeFlowContact(envelope([{ slug: "city", value: "\uD83C\uDFE0".repeat(121) }]), configured);
  assert.equal(Array.from(unicode.contact!.city!).length, 120);
  assert.ok(!unicode.contact!.city!.includes("\uFFFD"));
});

test("requested services accept string lists or JSON arrays, with strict element types and size limits", () => {
  const configured = flow({ bindings: [...flow().bindings, binding("services", "requested_services")] });
  for (const value of ['["Pulizie","Check-in","Pulizie"]', "Pulizie; Check-in\nPulizie"]) {
    const mapped = mapSystemeFlowContact(envelope([{ slug: "services", value }]), configured);
    assert.deepEqual(mapped.contact?.requested_services, ["Pulizie", "Check-in"]);
  }
  for (const value of ['["Pulizie", 1]', '[{"name":"Pulizie"}]', '["broken"']) {
    const mapped = mapSystemeFlowContact(envelope([{ slug: "services", value }]), configured);
    assert.equal(mapped.rejectionReason, null);
    assert.deepEqual(mapped.contact?.requested_services, []);
    assert.deepEqual(mapped.warnings, [{ field: "services", code: "invalid_value" }]);
  }
  const mapped = mapSystemeFlowContact(envelope([{ slug: "services", value: Array.from({ length: 22 }, (_, index) => `Servizio ${index}`).join(",") }]), configured);
  assert.equal(mapped.contact?.requested_services.length, 20);
  assert.deepEqual(mapped.warnings, [{ field: "services", code: "value_truncated" }]);
});

test("additional answers use stable flow/source keys, stay out of notes and cannot collide across flows", () => {
  const configured = flow({ bindings: [...flow().bindings, binding("custom", "additional", "Preferenze")] });
  const parsed = envelope([{ slug: "custom", value: "  Solo centro  " }]);
  const mapped = mapSystemeFlowContact(parsed, configured);
  assert.deepEqual(mapped.additionalAnswers, [{ fieldKey: `${milanId}:custom`, label: "Preferenze", value: "Solo centro" }]);
  assert.ok(!Object.hasOwn(mapped.contact!, "notes"));
  assert.ok(!Object.hasOwn(mapped.contact!, "stage_id"));
  assert.ok(!Object.hasOwn(mapped.contact!, "profile_id"));
  const other = mapSystemeFlowContact(parsed, flow({ ...configured, id: romeId }));
  assert.notEqual(mapped.additionalAnswers[0].fieldKey, other.additionalAnswers[0].fieldKey);
  assert.deepEqual(mapSystemeFlowContact(envelope([{ slug: "custom", value: " " }]), configured).additionalAnswers, []);
  const longSlug = "q".repeat(160);
  const long = mapSystemeFlowContact(envelope([{ slug: longSlug, value: "yes" }]), flow({ bindings: [...flow().bindings, binding(longSlug, "additional", "Domanda")] }));
  assert.ok(long.additionalAnswers[0].fieldKey.length <= 200);
});

test("oversized optional answers are truncated and invalid database characters cannot break valid contacts", () => {
  const configured = flow({ bindings: [...flow().bindings, binding("city", "city"), binding("question", "additional", "Informazioni")] });
  const mapped = mapSystemeFlowContact(envelope([{ slug: "city", value: "Ro\u0000ma\uD800" }, { slug: "question", value: "x".repeat(6000) }]), configured);
  assert.equal(mapped.rejectionReason, null);
  assert.equal(mapped.contact?.city, "Roma");
  assert.equal(mapped.additionalAnswers[0]?.value.length, 5000);
  assert.ok(mapped.warnings.some((warning) => warning.field === "city" && warning.code === "invalid_value"));
  assert.ok(mapped.warnings.some((warning) => warning.field === "question" && warning.code === "value_truncated"));
  assert.equal(systemeFlowSchema.safeParse({ ...configured, name: "Invalid\u0000name" }).success, false);
  assert.equal(systemeFlowSchema.safeParse({ ...configured, bindings: [...configured.bindings, binding("invalid\u0000source", "ignore")] }).success, false);
  assert.equal(parseSystemeFlowEnvelope(JSON.stringify({ contact: { id: 1, fields: [{ slug: "invalid\u0000source", value: "x" }] } })), null);
});

test("warnings are bounded, deduplicated and required-field diagnostics precede unknown fields", () => {
  const parsed = envelope([], { email: "invalid-private-value", fields: Array.from({ length: 199 }, (_, index) => ({ slug: `field_${index}`, value: `private answer ${index}` })) });
  const mapped = mapSystemeFlowContact(parsed, flow());
  assert.equal(mapped.warnings.length, 50);
  assert.equal(new Set(mapped.warnings.map((warning) => `${warning.field}:${warning.code}`)).size, 50);
  assert.deepEqual(mapped.warnings.slice(0, 2), [{ field: "first_name", code: "missing_required_field" }, { field: "email", code: "invalid_email" }]);
  assert.ok(!JSON.stringify(mapped.warnings).includes("private"));
});

test("planning is deterministic and does not mutate configuration or submitted fields", () => {
  const configured = flow();
  const parsed = envelope();
  const before = JSON.stringify({ configured, parsed });
  const first = planSystemeFlowImport(true, [configured], parsed);
  assert.deepEqual(planSystemeFlowImport(true, [configured], parsed), first);
  assert.equal(JSON.stringify({ configured, parsed }), before);
  assert.equal(first.flow?.destinationStageId, milanStage);
  assert.equal(first.mapped?.contact?.external_id, "123");
});

test("routing follows the provider sourceURL and does not infer a newer page from contact fields", () => {
  const milan = flow({ bindings: [...flow().bindings, binding("city", "city")] });
  const rome = flow({ id: romeId, name: "Lead Roma", allowedPageUrls: [romeUrl], destinationStageId: romeStage,
    bindings: [...flow().bindings, binding("neighborhood", "additional", "Zona preferita")] });
  // Real repeat opt-ins may contain fields from another form while retaining the original sourceURL.
  const parsed = envelope([{ slug: "city", value: "Roma" }, { slug: "neighborhood", value: "Centro" }]);
  const plan = planSystemeFlowImport(true, [milan, rome], parsed);
  assert.equal(plan.flow?.id, milanId);
  assert.equal(plan.mapped?.contact?.city, "Roma");
  assert.deepEqual(plan.mapped?.additionalAnswers, []);
  assert.ok(plan.mapped?.warnings.some((warning) => warning.field === "neighborhood" && warning.code === "unmapped_field"));
});

test("the legacy parser retains its existing behavior independently of flow mapping", () => {
  const custom = JSON.stringify({ contact: { id: 1, email: "a@example.test", fields: [{ slug: "nome_proprietario", value: "Anna Rossi" }] } });
  assert.equal(parseSystemeOptIn(custom).rejectionReason, "missing_name");
  const parsed = parseSystemeFlowEnvelope(custom);
  assert.ok(parsed);
  assert.equal(mapSystemeFlowContact(parsed, flow({ bindings: [binding("nome_proprietario", "full_name"), binding("email", "email")] })).contact?.full_name, "Anna Rossi");
});
