import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { dispatchSystemeImport, type SystemeAtomicFlowInput } from "./flow-dispatch";
import { parseSystemeFlowEnvelope } from "./flow-payload";
import { systemeFlowCommandSchema, systemeFlowSnapshotSchema, type SystemeFlowSnapshot } from "./flows";
import { handleSystemeWebhook, type SystemeImportEvent } from "./webhook";

const integrationId = "10000000-0000-4000-8000-000000000001";
const flowId = "20000000-0000-4000-8000-000000000001";
const secret = "test-server-signature";
const rawBody = JSON.stringify({ contact: { id: 321, email: "ANNA@example.test", sourceURL: "https://example.test/milano/?utm_campaign=one", fields: [
  { slug: "nome_custom", fieldName: "Nome completo", value: "Anna Rossi" },
  { slug: "citta_custom", fieldName: "Citta", value: "Milano" },
  { slug: "stanze_custom", fieldName: "Stanze", value: "due stanze" },
] } });

function snapshot(overrides: Partial<SystemeFlowSnapshot> = {}): SystemeFlowSnapshot {
  return { routingMode: "flows", enabled: true, updatedAt: "2026-10-15T12:00:00+00:00", configurationRevision: "1",
    configurationToken: "a".repeat(32), discoveryExpiresAt: null, flows: [{
      id: flowId, name: "Milano", enabled: true, importMode: "selected_pages", allowedPageUrls: ["https://example.test/milano"],
      destinationStageId: null, bindings: [
        { sourceSlug: "nome_custom", targetField: "full_name", additionalLabel: null },
        { sourceSlug: "email", targetField: "email", additionalLabel: null },
        { sourceSlug: "citta_custom", targetField: "city", additionalLabel: null },
        { sourceSlug: "stanze_custom", targetField: "bedrooms", additionalLabel: null },
      ],
    }], ...overrides };
}

function event(overrides: Partial<SystemeImportEvent> = {}): SystemeImportEvent {
  return { integrationId, secretRotatedAt: "2026-10-15T08:00:00Z", messageId: "message-1", eventType: "CONTACT_OPT_IN",
    payloadSha256: "a".repeat(64), eventOccurredAt: null, sourcePageUrl: "https://example.test/milano",
    contact: null, rejectionReason: "missing_name", flowEnvelope: parseSystemeFlowEnvelope(rawBody), protocolRejectionReason: null, ...overrides };
}

test("versioned flow commands bound discovery, reject ownership and keep deletion explicit", () => {
  const base = { version: 2, configurationToken: "a".repeat(32) };
  assert.equal(systemeFlowCommandSchema.safeParse({ ...base, command: { action: "save_flow", flow: snapshot().flows[0] } }).success, true);
  assert.equal(systemeFlowCommandSchema.safeParse({ ...base, command: { action: "delete_flow", flowId } }).success, true);
  assert.equal(systemeFlowCommandSchema.safeParse({ ...base, command: { action: "set_enabled", enabled: false } }).success, true);
  assert.equal(systemeFlowCommandSchema.safeParse({ ...base, command: { action: "start_discovery", minutes: 30 } }).success, true);
  assert.equal(systemeFlowCommandSchema.safeParse({ ...base, command: { action: "start_discovery", minutes: 31 } }).success, false);
  assert.equal(systemeFlowCommandSchema.safeParse({ ...base, command: { action: "start_discovery", minutes: 0 } }).success, false);
  assert.equal(systemeFlowCommandSchema.safeParse({ ...base, command: { action: "set_enabled", enabled: true, profileId: integrationId } }).success, false);
  assert.equal(systemeFlowCommandSchema.safeParse({ ...base, command: { action: "delete_flow" } }).success, false);
  assert.equal(systemeFlowCommandSchema.safeParse({ ...base, configurationToken: "old timestamp", command: { action: "stop_discovery" } }).success, false);
  assert.equal(systemeFlowCommandSchema.safeParse({ ...base, profileId: integrationId, command: { action: "stop_discovery" } }).success, false);
});

test("snapshots can display a legacy backfill that has not acquired mappings yet", () => {
  const current = snapshot({ routingMode: "legacy" });
  current.flows[0].bindings = [];
  assert.equal(systemeFlowSnapshotSchema.safeParse(current).success, true);
});

test("legacy dispatch leaves the existing importer and rejection rules in charge", async () => {
  let legacyCalls = 0;
  const result = await dispatchSystemeImport(event(), {
    loadSnapshot: async () => snapshot({ routingMode: "legacy" }),
    importLegacy: async () => { legacyCalls++; return { status: "failed", reason: "missing_name" }; },
    importFlow: async () => { throw new Error("Must not call flows importer"); },
  });
  assert.equal(legacyCalls, 1);
  assert.equal(result.reason, "missing_name");
});

test("flow dispatch uses the custom mapping rather than the legacy missing-name result", async () => {
  let calls = 0;
  const result = await dispatchSystemeImport(event(), {
    loadSnapshot: async () => snapshot(), importLegacy: async () => { throw new Error("Must not call legacy"); },
    importFlow: async (input) => {
      calls++;
      assert.equal(input.configurationToken, "a".repeat(32));
      assert.equal(input.flowId, flowId);
      assert.equal(input.rejectionReason, null);
      assert.equal(input.contact?.full_name, "Anna Rossi");
      assert.equal(input.contact?.city, "Milano");
      assert.equal(input.contact?.bedrooms, null);
      assert.deepEqual(input.warnings, [{ field: "stanze_custom", code: "invalid_number" }]);
      assert.equal(input.sourcePageUrl, "https://example.test/milano");
      assert.ok(input.discoveredFields.every((field) => Object.keys(field).sort().join(",") === "fieldLabel,sourceSlug"));
      assert.ok(!JSON.stringify(input.discoveredFields).includes("Anna Rossi"));
      return { status: "imported" };
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.status, "imported");
});

test("paused imports can discover field metadata without passing contact values to persistence", async () => {
  await dispatchSystemeImport(event(), {
    loadSnapshot: async () => snapshot({ enabled: false, discoveryExpiresAt: "2026-10-15T12:15:00Z" }),
    importLegacy: async () => { throw new Error("Must not call legacy"); },
    importFlow: async (input) => {
      assert.equal(input.contact, null);
      assert.deepEqual(input.additionalAnswers, []);
      assert.equal(input.rejectionReason, "connection_disabled");
      assert.equal(input.discoveredFields.length, 4);
      assert.ok(!JSON.stringify(input).includes("ANNA@example.test"));
      assert.ok(!JSON.stringify(input).includes("Anna Rossi"));
      return { status: "ignored" };
    },
  });
});

test("unsupported schemas cannot import or discover and malformed bodies are permanent rejections", async () => {
  for (const [overrides, reason] of [
    [{ protocolRejectionReason: "unsupported_schema" }, "unsupported_schema"],
    [{ protocolRejectionReason: "unsupported_event" }, "unsupported_event"],
    [{ flowEnvelope: null }, "invalid_payload"],
  ] as const) {
    await dispatchSystemeImport(event(overrides), {
      loadSnapshot: async () => snapshot(), importLegacy: async () => { throw new Error("Must not call legacy"); },
      importFlow: async (input) => {
        assert.equal(input.contact, null);
        assert.deepEqual(input.discoveredFields, []);
        assert.equal(input.rejectionReason, reason);
        return { status: "failed", reason, retryable: false };
      },
    });
  }
});

test("signed webhook reaches flow mapping only after signature verification and retries stale snapshots", async () => {
  let calls = 0;
  const dependencies = {
    loadSigningSecret: async () => ({ secret, rotatedAt: "2026-10-15T08:00:00Z" }), onError: () => {},
    importEvent: async (verified: SystemeImportEvent) => dispatchSystemeImport(verified, {
      loadSnapshot: async () => snapshot(), importLegacy: async () => { throw new Error("Must not call legacy"); },
      importFlow: async (input: SystemeAtomicFlowInput) => {
        calls++;
        assert.equal(input.contact?.full_name, "Anna Rossi");
        return { status: "failed", reason: "configuration_changed", retryable: true };
      },
    }),
  };
  const request = (signature: string) => new Request("https://leadhost.test/webhook", { method: "POST", body: rawBody, headers: {
    "x-webhook-signature": signature, "x-webhook-event": "CONTACT_OPT_IN", "x-webhook-message-id": "message-1", "x-webhook-schema-version": "1",
  } });
  const forged = await handleSystemeWebhook(request("0".repeat(64)), integrationId, dependencies);
  assert.equal(forged.status, 401);
  assert.equal(calls, 0);
  const signed = await handleSystemeWebhook(request(createHmac("sha256", secret).update(rawBody).digest("hex")), integrationId, dependencies);
  assert.equal(signed.status, 503);
  assert.equal(calls, 1);
});
