import { NextResponse, type NextRequest } from "next/server";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import { buildPagination, readPagination } from "@/lib/api/pagination";
import { fetchBillingIssuerSettings } from "@/lib/billing/invoice-settings";
import type {
  BillingInvoiceLine,
  BillingInvoiceStatus,
} from "@/lib/billing/invoice-types";
import type { Json } from "@/lib/supabase/database.types";

type SourceType = "wallet_top_up" | "prime_billing";

type PaymentLookupRow = {
  id: string;
  provider_checkout_session_id: string | null;
  provider_payment_id: string | null;
};

type InvoiceRow = {
  id: string;
  source_type: SourceType;
  wallet_transaction_id: string | null;
  prime_billing_period_id: string | null;
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
  line_items: Json;
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
};

const invoiceColumns =
  "id,source_type,wallet_transaction_id,prime_billing_period_id,payment_id,profile_id,status,amount_cents,currency,provisional_number,document_date,transmission_progressive,stripe_payment_intent_id,stripe_checkout_session_id,line_items,stamp_duty_applied,stamp_duty_amount_cents,generation_attempts,last_error,generated_at,downloaded_at,imported_at,sent_at,final_invoice_number,final_invoice_date";

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const { storageReady } = await fetchBillingIssuerSettings(supabase);

    if (!storageReady) {
      return NextResponse.json({
        storageReady: false,
        rows: [],
        stats: emptyStats(),
        pagination: buildPagination(1, 25, 0),
      });
    }

    const pagination = readPagination(request.nextUrl.searchParams);
    const requestedStatus = request.nextUrl.searchParams.get("status");
    const requestedSource = request.nextUrl.searchParams.get("source");
    const allowedStatuses = new Set([
      "all",
      "not_generated",
      "ready",
      "downloaded",
      "imported",
      "sent",
      "error",
    ]);
    const status = allowedStatuses.has(requestedStatus ?? "")
      ? requestedStatus!
      : "all";
    const source = ["all", "wallet_top_up", "prime_billing"].includes(
      requestedSource ?? "",
    )
      ? requestedSource!
      : "all";

    const [transactionsResult, primePeriodsResult, allInvoiceResult] =
      await Promise.all([
        source !== "prime_billing"
          ? supabase
              .from("wallet_transactions")
              .select(
                "id,profile_id,amount_cents,status,provider_reference,created_at,completed_at",
              )
              .eq("type", "top_up")
              .eq("status", "completed")
              .order("completed_at", { ascending: false })
              .limit(2000)
          : Promise.resolve({ data: [], error: null }),
        source !== "wallet_top_up"
          ? supabase
              .from("prime_billing_periods")
              .select(
                "id,profile_id,period_kind,status,provider_invoice_id,provider_payment_intent_id,provider_checkout_session_id,membership_amount_cents,wallet_recharge_amount_cents,total_amount_cents,currency,paid_at,created_at",
              )
              .eq("status", "paid")
              .order("paid_at", { ascending: false })
              .limit(2000)
          : Promise.resolve({ data: [], error: null }),
        supabase.from("billing_invoices").select("status,source_type"),
      ]);

    if (transactionsResult.error) throw transactionsResult.error;
    if (primePeriodsResult.error) throw primePeriodsResult.error;
    if (allInvoiceResult.error) throw allInvoiceResult.error;

    const transactions = transactionsResult.data ?? [];
    const primePeriods = primePeriodsResult.data ?? [];
    const transactionIds = transactions.map((item) => item.id);
    const primePeriodIds = primePeriods.map((item) => item.id);
    const profileIds = Array.from(
      new Set([
        ...transactions.map((item) => item.profile_id),
        ...primePeriods.map((item) => item.profile_id),
      ]),
    );
    const checkoutSessionIds = transactions
      .map((item) => item.provider_reference)
      .filter((value): value is string => Boolean(value));

    const [walletInvoicesResult, primeInvoicesResult, profilesResult, paymentsResult] =
      await Promise.all([
        transactionIds.length
          ? supabase
              .from("billing_invoices")
              .select(invoiceColumns)
              .in("wallet_transaction_id", transactionIds)
          : Promise.resolve({ data: [], error: null }),
        primePeriodIds.length
          ? supabase
              .from("billing_invoices")
              .select(invoiceColumns)
              .in("prime_billing_period_id", primePeriodIds)
          : Promise.resolve({ data: [], error: null }),
        profileIds.length
          ? supabase
              .from("profiles")
              .select("id,email,first_name,last_name")
              .in("id", profileIds)
          : Promise.resolve({ data: [], error: null }),
        checkoutSessionIds.length
          ? supabase
              .from("payments")
              .select("id,provider_checkout_session_id,provider_payment_id")
              .in("provider_checkout_session_id", checkoutSessionIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

    if (walletInvoicesResult.error) throw walletInvoicesResult.error;
    if (primeInvoicesResult.error) throw primeInvoicesResult.error;
    if (profilesResult.error) throw profilesResult.error;
    if (paymentsResult.error) throw paymentsResult.error;

    const invoices = [
      ...(walletInvoicesResult.data ?? []),
      ...(primeInvoicesResult.data ?? []),
    ] as InvoiceRow[];
    const invoicesByTransaction = new Map(
      invoices
        .filter((item) => item.wallet_transaction_id)
        .map((item) => [item.wallet_transaction_id!, item]),
    );
    const invoicesByPrimePeriod = new Map(
      invoices
        .filter((item) => item.prime_billing_period_id)
        .map((item) => [item.prime_billing_period_id!, item]),
    );
    const profilesById = new Map(
      (profilesResult.data ?? []).map((item) => [item.id, item]),
    );
    const paymentRows = (paymentsResult.data ?? []) as unknown as PaymentLookupRow[];
    const paymentsByCheckout = new Map(
      paymentRows
        .filter((item) => item.provider_checkout_session_id)
        .map((item) => [item.provider_checkout_session_id!, item]),
    );

    const walletRows = transactions.map((transaction) => {
      const invoice = invoicesByTransaction.get(transaction.id) ?? null;
      const payment = transaction.provider_reference
        ? paymentsByCheckout.get(transaction.provider_reference)
        : null;
      return buildRow({
        sourceType: "wallet_top_up",
        sourceId: transaction.id,
        profile: profilesById.get(transaction.profile_id),
        profileId: transaction.profile_id,
        amountCents: transaction.amount_cents,
        completedAt: transaction.completed_at ?? transaction.created_at,
        stripePaymentIntentId:
          invoice?.stripe_payment_intent_id ?? payment?.provider_payment_id ?? null,
        stripeCheckoutSessionId:
          invoice?.stripe_checkout_session_id ?? transaction.provider_reference,
        invoice,
        lineItems: invoice
          ? parseLines(invoice.line_items)
          : [{
              code: "wallet_top_up",
              description: "Ricarica Wallet Lead Host",
              amountCents: transaction.amount_cents,
            }],
        sourceLabel: "Ricarica Wallet",
      });
    });
    const primeRows = primePeriods.map((period) => {
      const invoice = invoicesByPrimePeriod.get(period.id) ?? null;
      return buildRow({
        sourceType: "prime_billing",
        sourceId: period.id,
        profile: profilesById.get(period.profile_id),
        profileId: period.profile_id,
        amountCents: period.total_amount_cents,
        completedAt: period.paid_at ?? period.created_at,
        stripePaymentIntentId:
          invoice?.stripe_payment_intent_id ?? period.provider_payment_intent_id,
        stripeCheckoutSessionId:
          invoice?.stripe_checkout_session_id ?? period.provider_checkout_session_id,
        invoice,
        lineItems: invoice
          ? parseLines(invoice.line_items)
          : buildPrimePreviewLines(period),
        sourceLabel:
          period.period_kind === "initial"
            ? "Attivazione PRIME"
            : period.period_kind === "renewal"
              ? "Rinnovo PRIME"
              : "Rettifica PRIME",
      });
    });

    const filteredRows = [...walletRows, ...primeRows]
      .filter((row) => matchesStatus(row.invoice, status))
      .sort(
        (left, right) =>
          new Date(right.completedAt).getTime() -
          new Date(left.completedAt).getTime(),
      );
    const rows = filteredRows.slice(pagination.from, pagination.to + 1);
    const invoiceStatuses = allInvoiceResult.data ?? [];

    return NextResponse.json({
      storageReady: true,
      rows,
      stats: {
        completedTopUps: transactions.length,
        completedPrimePayments: primePeriods.length,
        ready: invoiceStatuses.filter((item) =>
          ["ready", "downloaded"].includes(item.status),
        ).length,
        imported: invoiceStatuses.filter((item) =>
          ["imported", "sent"].includes(item.status),
        ).length,
        errors: invoiceStatuses.filter((item) => item.status === "error").length,
      },
      pagination: buildPagination(
        pagination.page,
        pagination.pageSize,
        filteredRows.length,
      ),
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

function buildRow({
  sourceType,
  sourceId,
  profile,
  profileId,
  amountCents,
  completedAt,
  stripePaymentIntentId,
  stripeCheckoutSessionId,
  invoice,
  lineItems,
  sourceLabel,
}: {
  sourceType: SourceType;
  sourceId: string;
  profile?: { first_name: string | null; last_name: string | null; email: string };
  profileId: string;
  amountCents: number;
  completedAt: string;
  stripePaymentIntentId: string | null;
  stripeCheckoutSessionId: string | null;
  invoice: InvoiceRow | null;
  lineItems: BillingInvoiceLine[];
  sourceLabel: string;
}) {
  return {
    sourceType,
    sourceId,
    walletTransactionId: sourceType === "wallet_top_up" ? sourceId : null,
    primeBillingPeriodId: sourceType === "prime_billing" ? sourceId : null,
    profileId,
    propertyManagerName:
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
      "Property Manager",
    propertyManagerEmail: profile?.email ?? null,
    amountCents,
    completedAt,
    stripePaymentIntentId,
    stripeCheckoutSessionId,
    sourceLabel,
    lineItems,
    invoice,
  };
}

function buildPrimePreviewLines(period: {
  period_kind: "initial" | "renewal" | "adjustment";
  membership_amount_cents: number;
  wallet_recharge_amount_cents: number;
}) {
  const lines: BillingInvoiceLine[] = [];
  if (period.membership_amount_cents > 0) {
    lines.push({
      code: "prime_membership",
      description:
        period.period_kind === "initial"
          ? "Servizi Lead Host PRIME primo mese"
          : "Membership Lead Host PRIME",
      amountCents: period.membership_amount_cents,
    });
  }
  if (period.wallet_recharge_amount_cents > 0) {
    lines.push({
      code: "prime_wallet_recharge",
      description: "Ricarica Wallet Lead Host PRIME",
      amountCents: period.wallet_recharge_amount_cents,
    });
  }
  return lines;
}

function parseLines(value: Json): BillingInvoiceLine[] {
  return Array.isArray(value) ? (value as unknown as BillingInvoiceLine[]) : [];
}

function matchesStatus(invoice: InvoiceRow | null, status: string) {
  if (status === "all") return true;
  if (status === "not_generated") return !invoice;
  if (status === "ready") {
    return Boolean(invoice && ["ready", "downloaded"].includes(invoice.status));
  }
  return invoice?.status === status;
}

function emptyStats() {
  return {
    completedTopUps: 0,
    completedPrimePayments: 0,
    ready: 0,
    imported: 0,
    errors: 0,
  };
}
