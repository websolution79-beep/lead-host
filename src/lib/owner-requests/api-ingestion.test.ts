import assert from "node:assert/strict";
import test from "node:test";
import {
  ownerLeadApiExample,
  ownerLeadApiSchema,
} from "@/lib/owner-requests/api-ingestion";

test("accepts the canonical owner lead payload", () => {
  const result = ownerLeadApiSchema.safeParse(ownerLeadApiExample);

  assert.equal(result.success, true);
});

test("normalizes Make string values for lists and consents", () => {
  const result = ownerLeadApiSchema.parse({
    ...ownerLeadApiExample,
    currentStatus: "Mai usato per affitti brevi",
    requestedServices: "Gestione completa|Pulizie",
    privacyConsent: "true",
    dataSharingConsent: "1",
    marketingConsent: "false",
  });

  assert.deepEqual(result.currentStatus, ["Mai usato per affitti brevi"]);
  assert.deepEqual(result.requestedServices, [
    "Gestione completa",
    "Pulizie",
  ]);
  assert.equal(result.privacyConsent, true);
  assert.equal(result.dataSharingConsent, true);
  assert.equal(result.marketingConsent, false);
});

test("rejects invalid geography", () => {
  const result = ownerLeadApiSchema.safeParse({
    ...ownerLeadApiExample,
    city: "Milano",
  });

  assert.equal(result.success, false);
  assert.ok(
    result.error?.issues.some((issue) => issue.path.join(".") === "city"),
  );
});

test("accepts a minimal payload with only the external id", () => {
  const result = ownerLeadApiSchema.parse({
    externalId: "meta_lead_minimal",
    provider: "make",
  });

  assert.deepEqual(result.currentStatus, []);
  assert.deepEqual(result.requestedServices, []);
  assert.equal(result.privacyConsent, undefined);
  assert.equal(result.city, undefined);
});

test("accepts partial geography for admin completion", () => {
  const result = ownerLeadApiSchema.safeParse({
    externalId: "meta_lead_city_only",
    city: "Roma",
  });

  assert.equal(result.success, true);
});

test("still requires an external id for idempotency", () => {
  const result = ownerLeadApiSchema.safeParse({
    firstName: "Mario",
  });

  assert.equal(result.success, false);
});

test("normalizes numeric external ids from automation tools", () => {
  const result = ownerLeadApiSchema.parse({
    externalId: 123456789,
  });

  assert.equal(result.externalId, "123456789");
});
