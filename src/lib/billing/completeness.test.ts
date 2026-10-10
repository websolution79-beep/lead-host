import assert from "node:assert/strict";
import test from "node:test";
import { getBillingProfileCompleteness } from "@/lib/billing/completeness";

const individual = {
  subject_type: "individual" as const,
  first_name: "Mario",
  last_name: "Rossi",
  fiscal_code: "RSSMRA80A01H501U",
  address_line: "Via Roma 1",
  postal_code: "00100",
  city: "Roma",
  province: "RM",
  country: "IT",
  invoice_email: "mario@example.com",
};

test("accepts complete individual billing details", () => {
  assert.equal(getBillingProfileCompleteness(individual).complete, true);
});

test("reports every invalid field before billing details are saved", () => {
  const result = getBillingProfileCompleteness({
    ...individual,
    fiscal_code: "RSSMRA80A01H501Q",
    postal_code: "100",
    invoice_email: "not-an-email",
  });
  assert.equal(result.complete, false);
  assert.deepEqual(result.missingFields, [
    "postal_code_invalid",
    "fiscal_code_invalid",
    "invoice_email_invalid",
  ]);
});

test("reports missing company details and electronic recipient", () => {
  const result = getBillingProfileCompleteness({
    subject_type: "company",
    company_name: "",
    vat_number: "",
    address_line: individual.address_line,
    postal_code: individual.postal_code,
    city: individual.city,
    province: individual.province,
    country: individual.country,
    sdi_code: "",
    pec: "",
  });
  assert.equal(result.complete, false);
  assert.deepEqual(result.missingFields, ["company_name", "vat_number", "electronic_recipient"]);
});
