import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import test from "node:test";
import { decryptSystemeSecret, encryptSystemeSecret, generateSystemeSigningSecret, normalizeSystemeJson, systemePayloadHash, verifySystemeSignature } from "./crypto";
import { normalizeSystemePageUrl, parseSystemeOptIn } from "./payload";
import { handleSystemeWebhook, type SystemeWebhookDependencies } from "./webhook";

const integrationId = "10000000-0000-4000-8000-000000000001";
const secret = "test-signing-secret-kept-on-server";
const sign = (body: string) => createHmac("sha256", secret).update(body).digest("hex");
const body = JSON.stringify({ contact: {
  id: 123,
  email: "TEST@example.test",
  sourceURL: "https://landing.example.test/proprietari/?utm_source=meta#form",
  fields: [
    { slug: "first_name", value: "Mario" }, { slug: "surname", value: "Rossi" },
    { slug: "phone_number", value: "+393001234567" }, { slug: "city", value: "Roma" },
  ],
} });

function request(value = body, headers: Record<string, string> = {}) {
  return new Request("https://leadhost.test/api/webhooks/systeme/test", { method: "POST", body: value, headers: {
    "content-type": "application/json", "x-webhook-signature": sign(value),
    "x-webhook-event": "CONTACT_OPT_IN", "x-webhook-message-id": "message-123",
    "x-webhook-schema-version": "1", ...headers,
  } });
}

function dependencies(importEvent: SystemeWebhookDependencies["importEvent"]): SystemeWebhookDependencies {
  return {
    loadSigningSecret: async () => ({ secret, rotatedAt: "2026-10-15T08:00:00Z" }),
    importEvent,
    onError: () => {},
  };
}

test("signing secrets are encrypted, bound to their integration and authenticated", () => {
  const key = randomBytes(32).toString("base64");
  const generated = generateSystemeSigningSecret();
  const encrypted = encryptSystemeSecret(generated, integrationId, key);
  assert.ok(!encrypted.includes(generated));
  assert.equal(decryptSystemeSecret(encrypted, integrationId, key), generated);
  assert.throws(() => decryptSystemeSecret(encrypted, "another-integration", key));
  assert.throws(() => decryptSystemeSecret(encrypted, integrationId, randomBytes(32).toString("base64")));
  const parts = encrypted.split(":");
  parts[3] = Buffer.alloc(16).toString("base64");
  assert.throws(() => decryptSystemeSecret(parts.join(":"), integrationId, key));
  assert.throws(() => encryptSystemeSecret(generated, integrationId, "short"));
  assert.notEqual(encrypted, encryptSystemeSecret(generated, integrationId, key));
});

test("normalizes signatures using the official slash/Unicode example", () => {
  const raw = JSON.stringify({ contact: { id: 123, sourceURL: "http://example.com", fields: [{ fieldName: "Prénom", slug: "first_name", value: "Jean" }] } });
  const expected = '{"contact":{"id":123,"sourceURL":"http:\\/\\/example.com","fields":[{"fieldName":"Pr\\u00e9nom","slug":"first_name","value":"Jean"}]}}';
  assert.equal(normalizeSystemeJson(raw), expected);
  assert.equal(verifySystemeSignature(raw, sign(expected), secret), true);
  assert.equal(verifySystemeSignature(raw, sign(raw), secret), true);
  assert.equal(verifySystemeSignature(raw + " ", "0".repeat(64), secret), false);
  assert.equal(verifySystemeSignature(raw, sign(raw), "wrong-secret"), false);
  assert.equal(verifySystemeSignature(raw, "not-a-signature", secret), false);
  assert.equal(systemePayloadHash(raw), systemePayloadHash(JSON.stringify(JSON.parse(raw), null, 2)));
  const unicode = JSON.stringify({ text: "\uD83C\uDFE0 / \u00e0" });
  assert.equal(normalizeSystemeJson(unicode), '{"text":"\\ud83c\\udfe0 \\/ \\u00e0"}');
});

test("page matching ignores campaign parameters, fragments, default ports and trailing slashes", () => {
  assert.equal(normalizeSystemePageUrl("https://LANDING.EXAMPLE.TEST:443/proprietari/?utm_campaign=uno#form"), "https://landing.example.test/proprietari");
  assert.equal(normalizeSystemePageUrl("https://landing.example.test/?utm_campaign=due"), "https://landing.example.test");
  assert.equal(normalizeSystemePageUrl("https://landing.example.test/Altra"), "https://landing.example.test/Altra");
  assert.equal(normalizeSystemePageUrl("javascript:alert(1)"), null);
  assert.equal(normalizeSystemePageUrl("https://user:password@landing.example.test"), null);
  assert.equal(normalizeSystemePageUrl(null), null);
});

test("maps contact fields and rejects missing names without inventing customer details", () => {
  const parsed = parseSystemeOptIn(body);
  assert.equal(parsed.rejectionReason, null);
  assert.equal(parsed.contact?.full_name, "Mario Rossi");
  assert.equal(parsed.contact?.email, "test@example.test");
  assert.equal(parsed.contact?.phone, "+393001234567");
  assert.equal(parsed.contact?.city, "Roma");
  assert.equal(parsed.sourcePageUrl, "https://landing.example.test/proprietari");
  assert.equal(parseSystemeOptIn('{"contact":{"id":1,"email":"a@example.test"}}').rejectionReason, "missing_name");
  assert.equal(parseSystemeOptIn("invalid JSON").rejectionReason, "invalid_payload");
  assert.equal(parseSystemeOptIn('{"contact":{"id":9007199254740992,"email":"a@example.test"}}').rejectionReason, "invalid_payload");
});

test("a forged signature never calls the importer", async () => {
  let imported = false;
  const result = await handleSystemeWebhook(request(body, { "x-webhook-signature": "0".repeat(64) }), integrationId,
    dependencies(async () => { imported = true; return { status: "imported" }; }));
  assert.equal(result.status, 401);
  assert.equal(imported, false);
});

test("passes only verified, normalized events to the atomic importer", async () => {
  const result = await handleSystemeWebhook(request(), integrationId, dependencies(async (event) => {
    assert.equal(event.integrationId, integrationId);
    assert.equal(event.contact?.external_id, "123");
    assert.equal(event.sourcePageUrl, "https://landing.example.test/proprietari");
    assert.equal(event.rejectionReason, null);
    return { status: "imported" };
  }));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: true, status: "imported" });
});

test("unsupported events and schema versions are recorded but cannot create contacts", async () => {
  for (const [headers, expected] of [
    [{ "x-webhook-event": "SALE_NEW" }, "unsupported_event"],
    [{ "x-webhook-schema-version": "2" }, "unsupported_schema"],
  ] as const) {
    const result = await handleSystemeWebhook(request(body, headers), integrationId, dependencies(async (event) => {
      assert.equal(event.rejectionReason, expected);
      return { status: "ignored", reason: expected };
    }));
    assert.equal(result.status, 200);
  }
});

test("retries transient errors, acknowledges duplicates and rejects message conflicts", async () => {
  for (const [result, expectedStatus] of [
    [{ status: "duplicate" }, 200], [{ status: "conflict" }, 409],
    [{ status: "stale_secret" }, 401], [{ status: "failed", retryable: true }, 503],
    [{ status: "failed", reason: "missing_name", retryable: false }, 200],
  ] as const) {
    const response = await handleSystemeWebhook(request(), integrationId, dependencies(async () => result));
    assert.equal(response.status, expectedStatus);
  }
});

test("oversized or incomplete requests cannot reach the importer", async () => {
  let called = false;
  const deps = dependencies(async () => { called = true; return { status: "imported" }; });
  assert.equal((await handleSystemeWebhook(request("x".repeat(256 * 1024 + 1)), integrationId, deps)).status, 413);
  assert.equal((await handleSystemeWebhook(request(body, { "x-webhook-message-id": "" }), integrationId, deps)).status, 400);
  assert.equal((await handleSystemeWebhook(request(), "invalid-id", deps)).status, 404);
  assert.equal(called, false);
});

test("internal errors never include secrets or contact payloads in the response", async () => {
  const response = await handleSystemeWebhook(request(), integrationId, {
    ...dependencies(async () => ({ status: "imported" })),
    loadSigningSecret: async () => { throw new Error(`${secret} TEST@example.test`); },
  });
  assert.equal(response.status, 503);
  const responseBody = await response.text();
  assert.ok(!responseBody.includes(secret));
  assert.ok(!responseBody.includes("TEST@example.test"));
});
