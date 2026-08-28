export type BillingInvoiceStatus =
  | "pending"
  | "generating"
  | "ready"
  | "downloaded"
  | "imported"
  | "sent"
  | "error"
  | "cancelled";

export type BillingIssuerSettings = {
  id: number;
  legalName: string;
  vatCountryCode: string;
  vatNumber: string;
  fiscalCode: string;
  addressLine: string;
  postalCode: string;
  city: string;
  province: string;
  country: string;
  email: string;
  taxRegime: string;
  taxRegimeDescription: string;
  vatRate: number;
  vatNature: string;
  vatReference: string;
  documentType: string;
  transmissionFormat: string;
  arubaTransmitterTaxCode: string;
  currency: string;
  lineDescription: string;
  paymentMethod: string;
  provisionalNumberPrefix: string;
  stampDutyThresholdCents: number;
  stampDutyAmountCents: number;
  stampDutyAbsorbed: boolean;
  autoGenerateInvoices: boolean;
  updatedAt: string | null;
};

export type BillingCustomerSnapshot = {
  subjectType: "individual" | "company";
  firstName: string | null;
  lastName: string | null;
  fiscalCode: string | null;
  companyName: string | null;
  vatNumber: string | null;
  companyFiscalCode: string | null;
  addressLine: string;
  postalCode: string;
  city: string;
  province: string;
  country: string;
  sdiCode: string | null;
  pec: string | null;
  invoiceEmail: string;
  capturedAt: string;
};

export type WalletTopUpInvoiceSource = {
  walletTransactionId: string;
  paymentId: string | null;
  profileId: string;
  amountCents: number;
  currency: string;
  completedAt: string;
  stripePaymentIntentId: string | null;
  stripeCheckoutSessionId: string | null;
};

export type BillingInvoiceLine = {
  code: string;
  description: string;
  amountCents: number;
};

export type BillingInvoiceSource = {
  walletTransactionId: string | null;
  primeBillingPeriodId: string | null;
  paymentId: string | null;
  profileId: string;
  amountCents: number;
  currency: string;
  completedAt: string;
  stripePaymentIntentId: string | null;
  stripeCheckoutSessionId: string | null;
  lineItems?: BillingInvoiceLine[];
  description?: string;
};

export type FatturaPaGenerationInput = {
  issuer: BillingIssuerSettings;
  customer: BillingCustomerSnapshot;
  source: BillingInvoiceSource;
  transmissionProgressive: string;
  provisionalNumber?: string | null;
  documentDate?: string | null;
};

export type FatturaPaGenerationResult = {
  xml: string;
  provisionalNumber: string;
  documentDate: string;
  stampDutyApplied: boolean;
  stampDutyAmountCents: number;
};
