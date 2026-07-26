import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidItalianFiscalCode,
  isValidItalianVatNumber,
} from "@/lib/billing/fiscal-validation";

test("validates the SOGI fiscal identifiers from the Aruba invoice", () => {
  assert.equal(isValidItalianVatNumber("IT17750971008"), true);
  assert.equal(isValidItalianFiscalCode("DMNRMN83D56H501A"), true);
});

test("rejects invalid Italian fiscal identifiers", () => {
  assert.equal(isValidItalianVatNumber("17750971009"), false);
  assert.equal(isValidItalianFiscalCode("DMNRMN83D56H501B"), false);
  assert.equal(isValidItalianFiscalCode("short"), false);
});
