import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateFatturaPaXml } from "@/lib/billing/invoice-generator";
import { fetchBillingIssuerSettings } from "@/lib/billing/invoice-settings";
import type {
  BillingCustomerSnapshot,
  BillingInvoiceStatus,
  BillingIssuerSettings,
} from "@/lib/billing/invoice-types";
import {
  normalizeFiscalCode,
  normalizeItalianVatNumber,
} from "@/lib/billing/fiscal-validation";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";

type ServiceClient = SupabaseClient<Database>;

type WalletTransactionRow = {
  id: string;
  profile_id: string;
  type: string;
  status: string;
  amount_cents: number;
  provider_reference: string | null;
  metadata: Json;
  completed_at: string | null;
};

type PaymentRow = {
  id: string;
  provider_payment_id: string | null;
  provider_checkout_session_id: string | null;
};

type BillingInvoiceRow = {
  id: string;
  wallet_transaction_id: string;
  payment_id: string | null;
  profile_id: string;
  status: BillingInvoiceStatus;
  amount_cents: number;
  currency: string;
  provisional_number: string | null;
  document_date: string | null;
  transmission_progressive: string;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  issuer_snapshot: Json;
  customer_snapshot: Json;
  xml_content: string | null;
  xml_sha256: string | null;
  stamp_duty_applied: boolean;
  stamp_duty_amount_cents: number;
  generation_attempts: number;
  last_error: string | null;
  generated_at: string | null;
  downloaded_at: string | null;
  imported_at: string | null;
  sent_at: string | null;
  final_invoice_number: string | null;
  final_invoice_date: string | null;
  created_at: string;
  updated_at: string;
};

type BillingProfileRow = {
  subject_type: "individual" | "company";
  first_name: string | null;
  last_name: string | null;
  fiscal_code: string | null;
  company_name: string | null;
  vat_number: string | null;
  company_fiscal_code: string | null;
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  province: string | null;
  country: string;
  sdi_code: string | null;
  pec: string | null;
  invoice_email: string | null;
};

export async function generateWalletTopUpInvoice({
  supabase,
  walletTransactionId,
  actorProfileId = null,
}: {
  supabase: ServiceClient;
  walletTransactionId: string;
  actorProfileId?: string | null;
}) {
  const transaction = await fetchWalletTransaction(
    supabase,
    walletTransactionId,
  );

  if (transaction.type !== "top_up" || transaction.status !== "completed") {
    throw new Error("La fattura puo essere generata solo per una ricarica completata.");
  }
  if (!transaction.completed_at) {
    throw new Error("Data di completamento della ricarica non disponibile.");
  }

  const { settings, storageReady } =
    await fetchBillingIssuerSettings(supabase);

  if (!storageReady) {
    throw new Error("Database fatturazione non aggiornato.");
  }

  const payment = await fetchPayment(
    supabase,
    transaction.provider_reference,
  );
  const existingInvoice = await fetchInvoiceByTransaction(
    supabase,
    walletTransactionId,
  );

  if (
    existingInvoice &&
    ["imported", "sent", "cancelled"].includes(existingInvoice.status)
  ) {
    throw new Error(
      "La fattura non puo essere rigenerata dopo l'importazione in Aruba.",
    );
  }

  const customerSnapshot = existingInvoice
    ? parseCustomerSnapshot(existingInvoice.customer_snapshot)
    : await loadCustomerSnapshot(supabase, transaction);
  const issuerSnapshot = existingInvoice
    ? parseIssuerSnapshot(existingInvoice.issuer_snapshot)
    : settings;
  const invoice =
    existingInvoice ??
    (await createInvoiceRecord({
      supabase,
      transaction,
      payment,
      issuer: issuerSnapshot,
      customer: customerSnapshot,
    }));

  await updateInvoice(supabase, invoice.id, {
    status: "generating",
    generation_attempts: invoice.generation_attempts + 1,
    last_error: null,
  });

  try {
    const result = generateFatturaPaXml({
      issuer: issuerSnapshot,
      customer: customerSnapshot,
      transmissionProgressive: invoice.transmission_progressive,
      provisionalNumber: invoice.provisional_number,
      documentDate: invoice.document_date,
      source: {
        walletTransactionId: transaction.id,
        paymentId: payment?.id ?? invoice.payment_id,
        profileId: transaction.profile_id,
        amountCents: transaction.amount_cents,
        currency: invoice.currency,
        completedAt: transaction.completed_at,
        stripePaymentIntentId:
          payment?.provider_payment_id ??
          readString(transaction.metadata, "stripe_payment_intent"),
        stripeCheckoutSessionId:
          payment?.provider_checkout_session_id ??
          transaction.provider_reference,
      },
    });
    const xmlSha256 = createHash("sha256")
      .update(result.xml, "utf8")
      .digest("hex");
    const updated = await updateInvoice(supabase, invoice.id, {
      payment_id: payment?.id ?? invoice.payment_id,
      status: "ready",
      provisional_number: result.provisionalNumber,
      document_date: result.documentDate,
      stripe_payment_intent_id:
        payment?.provider_payment_id ??
        invoice.stripe_payment_intent_id,
      stripe_checkout_session_id:
        payment?.provider_checkout_session_id ??
        invoice.stripe_checkout_session_id,
      issuer_snapshot: issuerSnapshot as unknown as Json,
      customer_snapshot: customerSnapshot as unknown as Json,
      xml_content: result.xml,
      xml_sha256: xmlSha256,
      stamp_duty_applied: result.stampDutyApplied,
      stamp_duty_amount_cents: result.stampDutyAmountCents,
      generated_at: new Date().toISOString(),
      last_error: null,
    });

    await recordInvoiceEvent(supabase, {
      invoiceId: invoice.id,
      eventType: "xml_generated",
      actorProfileId,
      details: {
        xml_sha256: xmlSha256,
        stamp_duty_applied: result.stampDutyApplied,
        automatic: actorProfileId === null,
      },
    });

    return updated;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Generazione XML non completata.";

    await updateInvoice(supabase, invoice.id, {
      status: "error",
      last_error: message,
    });
    await recordInvoiceEvent(supabase, {
      invoiceId: invoice.id,
      eventType: "generation_failed",
      actorProfileId,
      details: { error: message },
    });

    throw error;
  }
}

export async function generateWalletTopUpInvoiceSafely(
  walletTransactionId: string,
) {
  try {
    const supabase = createServiceSupabaseClient();
    const { settings, storageReady } =
      await fetchBillingIssuerSettings(supabase);

    if (!storageReady || !settings.autoGenerateInvoices) {
      return {
        status: "skipped" as const,
        reason: storageReady ? "automatic_generation_disabled" : "storage_not_ready",
      };
    }

    const invoice = await generateWalletTopUpInvoice({
      supabase,
      walletTransactionId,
    });

    return { status: "generated" as const, invoiceId: invoice.id };
  } catch (error) {
    console.error(
      "Wallet top-up invoice generation failed:",
      error instanceof Error ? error.message : "Errore sconosciuto.",
    );

    return { status: "failed" as const };
  }
}

export async function recordInvoiceEvent(
  supabase: ServiceClient,
  {
    invoiceId,
    eventType,
    actorProfileId,
    details = {},
  }: {
    invoiceId: string;
    eventType: string;
    actorProfileId: string | null;
    details?: Json;
  },
) {
  const table = supabase.from("billing_invoice_events" as never) as unknown as {
    insert: (row: Record<string, unknown>) => Promise<{
      error: { message?: string } | null;
    }>;
  };
  const { error } = await table.insert({
    invoice_id: invoiceId,
    event_type: eventType,
    actor_profile_id: actorProfileId,
    details,
  });

  if (error) {
    console.error("Billing invoice event not recorded:", error.message);
  }
}

async function fetchWalletTransaction(
  supabase: ServiceClient,
  walletTransactionId: string,
) {
  const { data, error } = await supabase
    .from("wallet_transactions")
    .select(
      "id,profile_id,type,status,amount_cents,provider_reference,metadata,completed_at",
    )
    .eq("id", walletTransactionId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Ricarica wallet non trovata.");
  }

  return data as WalletTransactionRow;
}

async function fetchPayment(
  supabase: ServiceClient,
  checkoutSessionId: string | null,
) {
  if (!checkoutSessionId) return null;

  const table = supabase.from("payments" as never) as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: PaymentRow | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };
  const { data, error } = await table
    .select("id,provider_payment_id,provider_checkout_session_id")
    .eq("provider_checkout_session_id", checkoutSessionId)
    .maybeSingle();

  if (error) throw new Error(error.message ?? "Pagamento Stripe non trovato.");

  return data;
}

async function fetchInvoiceByTransaction(
  supabase: ServiceClient,
  walletTransactionId: string,
) {
  const table = supabase.from("billing_invoices" as never) as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: BillingInvoiceRow | null;
          error: { code?: string; message?: string } | null;
        }>;
      };
    };
  };
  const { data, error } = await table
    .select("*")
    .eq("wallet_transaction_id", walletTransactionId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Archivio fatture non disponibile.");
  }

  return data;
}

async function createInvoiceRecord({
  supabase,
  transaction,
  payment,
  issuer,
  customer,
}: {
  supabase: ServiceClient;
  transaction: WalletTransactionRow;
  payment: PaymentRow | null;
  issuer: BillingIssuerSettings;
  customer: BillingCustomerSnapshot;
}) {
  const table = supabase.from("billing_invoices" as never) as unknown as {
    insert: (row: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{
          data: BillingInvoiceRow | null;
          error: { code?: string; message?: string } | null;
        }>;
      };
    };
  };
  const { data, error } = await table
    .insert({
      wallet_transaction_id: transaction.id,
      payment_id: payment?.id ?? null,
      profile_id: transaction.profile_id,
      status: "pending",
      amount_cents: transaction.amount_cents,
      currency: "EUR",
      stripe_payment_intent_id:
        payment?.provider_payment_id ??
        readString(transaction.metadata, "stripe_payment_intent"),
      stripe_checkout_session_id:
        payment?.provider_checkout_session_id ??
        transaction.provider_reference,
      issuer_snapshot: issuer as unknown as Json,
      customer_snapshot: customer as unknown as Json,
    })
    .select("*")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      const existing = await fetchInvoiceByTransaction(
        supabase,
        transaction.id,
      );

      if (existing) return existing;
    }

    throw new Error(error?.message ?? "Fattura non creata.");
  }

  await recordInvoiceEvent(supabase, {
    invoiceId: data.id,
    eventType: "invoice_created",
    actorProfileId: null,
    details: { wallet_transaction_id: transaction.id },
  });

  return data;
}

async function updateInvoice(
  supabase: ServiceClient,
  invoiceId: string,
  values: Record<string, unknown>,
) {
  const table = supabase.from("billing_invoices" as never) as unknown as {
    update: (row: Record<string, unknown>) => {
      eq: (column: string, value: string) => {
        select: (columns: string) => {
          single: () => Promise<{
            data: BillingInvoiceRow | null;
            error: { message?: string } | null;
          }>;
        };
      };
    };
  };
  const { data, error } = await table
    .update(values)
    .eq("id", invoiceId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Fattura non aggiornata.");
  }

  return data;
}

async function loadCustomerSnapshot(
  supabase: ServiceClient,
  transaction: WalletTransactionRow,
) {
  const metadata = asRecord(transaction.metadata);
  const storedBilling = asRecord(metadata.billing_snapshot);
  const storedEmail = readString(
    transaction.metadata,
    "profile_email",
  );
  const capturedAt =
    typeof metadata.billing_snapshot_captured_at === "string"
      ? metadata.billing_snapshot_captured_at
      : transaction.completed_at ?? new Date().toISOString();

  if (Object.keys(storedBilling).length > 0) {
    return mapBillingProfileSnapshot(
      storedBilling as unknown as BillingProfileRow,
      storedEmail,
      capturedAt,
    );
  }

  const [{ data: billing, error: billingError }, { data: profile, error: profileError }] =
    await Promise.all([
      supabase
        .from("billing_profiles")
        .select("*")
        .eq("profile_id", transaction.profile_id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("email")
        .eq("id", transaction.profile_id)
        .single(),
    ]);

  if (billingError || !billing) {
    throw new Error(
      billingError?.message ?? "Dati di fatturazione cliente non trovati.",
    );
  }
  if (profileError || !profile) {
    throw new Error(profileError?.message ?? "Profilo cliente non trovato.");
  }

  return mapBillingProfileSnapshot(
    billing as BillingProfileRow,
    profile.email,
    capturedAt,
  );
}

function mapBillingProfileSnapshot(
  profile: BillingProfileRow,
  fallbackEmail: string | null,
  capturedAt: string,
): BillingCustomerSnapshot {
  return {
    subjectType: profile.subject_type,
    firstName: profile.first_name?.trim() || null,
    lastName: profile.last_name?.trim() || null,
    fiscalCode: profile.fiscal_code
      ? normalizeFiscalCode(profile.fiscal_code)
      : null,
    companyName: profile.company_name?.trim() || null,
    vatNumber: profile.vat_number
      ? normalizeItalianVatNumber(profile.vat_number)
      : null,
    companyFiscalCode: profile.company_fiscal_code
      ? normalizeFiscalCode(profile.company_fiscal_code)
      : null,
    addressLine: profile.address_line?.trim() ?? "",
    postalCode: profile.postal_code?.trim() ?? "",
    city: profile.city?.trim() ?? "",
    province: profile.province?.trim().toUpperCase() ?? "",
    country: profile.country?.trim().toUpperCase() || "IT",
    sdiCode: profile.sdi_code?.trim().toUpperCase() || null,
    pec: profile.pec?.trim().toLowerCase() || null,
    invoiceEmail:
      profile.invoice_email?.trim().toLowerCase() ||
      fallbackEmail?.trim().toLowerCase() ||
      "",
    capturedAt,
  };
}

function parseCustomerSnapshot(value: Json) {
  const record = asRecord(value);

  return record as unknown as BillingCustomerSnapshot;
}

function parseIssuerSnapshot(value: Json) {
  const record = asRecord(value);

  return record as unknown as BillingIssuerSettings;
}

function asRecord(value: Json | undefined): Record<string, Json> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return value as Record<string, Json>;
}

function readString(value: Json, key: string) {
  const record = asRecord(value);
  const result = record[key];

  return typeof result === "string" ? result : null;
}
