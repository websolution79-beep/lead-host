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

test("rejects missing consent", () => {
  const result = ownerLeadApiSchema.safeParse({
    ...ownerLeadApiExample,
    privacyConsent: false,
  });

  assert.equal(result.success, false);
  assert.ok(
    result.error?.issues.some(
      (issue) => issue.path.join(".") === "privacyConsent",
    ),
  );
});
