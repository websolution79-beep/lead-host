import assert from "node:assert/strict";
import test from "node:test";
import { generateFatturaPaXml } from "@/lib/billing/invoice-generator";
import { defaultBillingIssuerSettings } from "@/lib/billing/invoice-settings";
import type {
  BillingCustomerSnapshot,
  FatturaPaGenerationInput,
} from "@/lib/billing/invoice-types";

const individualCustomer: BillingCustomerSnapshot = {
  subjectType: "individual",
  firstName: "Mario",
  lastName: "Rossi",
  fiscalCode: "RSSMRA80A01H501U",
  companyName: null,
  vatNumber: null,
  companyFiscalCode: null,
  addressLine: "Via Roma 10",
  postalCode: "00100",
  city: "Roma",
  province: "RM",
  country: "IT",
  sdiCode: null,
  pec: null,
  invoiceEmail: "mario.rossi@example.com",
  capturedAt: "2026-07-26T10:00:00.000Z",
};

function buildInput(
  amountCents: number,
  customer = individualCustomer,
): FatturaPaGenerationInput {
  return {
    issuer: defaultBillingIssuerSettings,
    customer,
    transmissionProgressive: "0000000042",
    source: {
      walletTransactionId: "3d41d9ce-8fea-4af9-a9bd-424446021783",
      paymentId: "9c537f96-dda5-45a7-9820-bd9c7cc8cebb",
      profileId: "4130d91a-3d92-40d8-ab65-96d43449030e",
      amountCents,
      currency: "eur",
      completedAt: "2026-07-26T22:30:00.000Z",
      stripePaymentIntentId: "pi_test_123",
      stripeCheckoutSessionId: "cs_test_123",
    },
  };
}

test("generates an Aruba-compatible individual invoice without stamp duty", () => {
  const result = generateFatturaPaXml(buildInput(3000));

  assert.match(result.xml, /<p:FatturaElettronica/);
  assert.match(result.xml, /<IdCodice>01879020517<\/IdCodice>/);
  assert.match(result.xml, /<FormatoTrasmissione>FPR12<\/FormatoTrasmissione>/);
  assert.match(result.xml, /<CodiceDestinatario>0000000<\/CodiceDestinatario>/);
  assert.match(result.xml, /<RegimeFiscale>RF19<\/RegimeFiscale>/);
  assert.match(result.xml, /<Natura>N2\.2<\/Natura>/);
  assert.match(result.xml, /<ModalitaPagamento>MP08<\/ModalitaPagamento>/);
  assert.match(result.xml, /<ImportoTotaleDocumento>30\.00<\/ImportoTotaleDocumento>/);
  assert.doesNotMatch(result.xml, /<DatiBollo>/);
  assert.equal(result.stampDutyApplied, false);
});

test("marks stamp duty as absorbed by SOGI without increasing the payment total", () => {
  const result = generateFatturaPaXml(buildInput(10000));

  assert.match(result.xml, /<BolloVirtuale>SI<\/BolloVirtuale>/);
  assert.match(result.xml, /<ImportoBollo>2\.00<\/ImportoBollo>/);
  assert.match(
    result.xml,
    /<ImportoTotaleDocumento>100\.00<\/ImportoTotaleDocumento>/,
  );
  assert.match(result.xml, /<ImportoPagamento>100\.00<\/ImportoPagamento>/);
  assert.equal(result.stampDutyApplied, true);
  assert.equal(result.stampDutyAmountCents, 200);
});

test("uses the company SDI code and escapes XML content", () => {
  const companyCustomer: BillingCustomerSnapshot = {
    ...individualCustomer,
    subjectType: "company",
    firstName: null,
    lastName: null,
    fiscalCode: null,
    companyName: "ADP & Partners SRL",
    vatNumber: "IT01176210316",
    companyFiscalCode: "01176210316",
    sdiCode: "ABC1234",
    pec: "adp@examplepec.it",
  };
  const result = generateFatturaPaXml(buildInput(5000, companyCustomer));

  assert.match(result.xml, /<CodiceDestinatario>ABC1234<\/CodiceDestinatario>/);
  assert.doesNotMatch(result.xml, /<PECDestinatario>/);
  assert.match(result.xml, /<Denominazione>ADP &amp; Partners SRL<\/Denominazione>/);
});
