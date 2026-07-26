import { NextResponse, type NextRequest } from "next/server";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import { buildPagination, readPagination } from "@/lib/api/pagination";
import { fetchBillingIssuerSettings } from "@/lib/billing/invoice-settings";
import type { BillingInvoiceStatus } from "@/lib/billing/invoice-types";

type InvoiceRow = {
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

    const { data: transactions, error } = await supabase
      .from("wallet_transactions")
      .select(
        "id,profile_id,amount_cents,status,provider_reference,created_at,completed_at",
      )
      .eq("type", "top_up")
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(2000);

    if (error) throw error;

    const transactionIds = (transactions ?? []).map((item) => item.id);
    const profileIds = Array.from(
      new Set((transactions ?? []).map((item) => item.profile_id)),
    );
    const checkoutSessionIds = (transactions ?? [])
      .map((item) => item.provider_reference)
      .filter((value): value is string => Boolean(value));

    const invoiceTable = supabase.from("billing_invoices" as never) as never;
    const paymentTable = supabase.from("payments" as never) as never;
    const [invoiceResult, profilesResult, paymentsResult, allInvoiceResult] =
      await Promise.all([
        transactionIds.length
          ? (invoiceTable as {
              select: (columns: string) => {
                in: (
                  column: string,
                  values: string[],
                ) => Promise<{ data: InvoiceRow[] | null; error: Error | null }>;
              };
            })
              .select(
                "id,wallet_transaction_id,payment_id,profile_id,status,amount_cents,currency,provisional_number,document_date,transmission_progressive,stripe_payment_intent_id,stripe_checkout_session_id,stamp_duty_applied,stamp_duty_amount_cents,generation_attempts,last_error,generated_at,downloaded_at,imported_at,sent_at,final_invoice_number,final_invoice_date",
              )
              .in("wallet_transaction_id", transactionIds)
          : Promise.resolve({ data: [], error: null }),
        profileIds.length
          ? supabase
              .from("profiles")
              .select("id,email,first_name,last_name")
              .in("id", profileIds)
          : Promise.resolve({ data: [], error: null }),
        checkoutSessionIds.length
          ? (paymentTable as {
              select: (columns: string) => {
                in: (
                  column: string,
                  values: string[],
                ) => Promise<{
                  data:
                    | {
                        id: string;
                        provider_checkout_session_id: string | null;
                        provider_payment_id: string | null;
                      }[]
                    | null;
                  error: Error | null;
                }>;
              };
            })
              .select(
                "id,provider_checkout_session_id,provider_payment_id",
              )
              .in("provider_checkout_session_id", checkoutSessionIds)
          : Promise.resolve({ data: [], error: null }),
        (invoiceTable as {
          select: (columns: string) => Promise<{
            data: { status: BillingInvoiceStatus }[] | null;
            error: Error | null;
          }>;
        }).select("status"),
      ]);

    if (invoiceResult.error) throw invoiceResult.error;
    if (profilesResult.error) throw profilesResult.error;
    if (paymentsResult.error) throw paymentsResult.error;
    if (allInvoiceResult.error) throw allInvoiceResult.error;

    const invoicesByTransaction = new Map(
      (invoiceResult.data ?? []).map((item) => [
        item.wallet_transaction_id,
        item,
      ]),
    );
    const profilesById = new Map(
      (profilesResult.data ?? []).map((item) => [item.id, item]),
    );
    const paymentsByCheckout = new Map(
      (paymentsResult.data ?? [])
        .filter((item) => item.provider_checkout_session_id)
        .map((item) => [item.provider_checkout_session_id!, item]),
    );

    const filteredRows = (transactions ?? [])
      .map((transaction) => {
        const invoice = invoicesByTransaction.get(transaction.id) ?? null;
        const profile = profilesById.get(transaction.profile_id);
        const payment = transaction.provider_reference
          ? paymentsByCheckout.get(transaction.provider_reference)
          : null;

        return {
          walletTransactionId: transaction.id,
          profileId: transaction.profile_id,
          propertyManagerName:
            [profile?.first_name, profile?.last_name]
              .filter(Boolean)
              .join(" ") || "Property Manager",
          propertyManagerEmail: profile?.email ?? null,
          amountCents: transaction.amount_cents,
          completedAt: transaction.completed_at ?? transaction.created_at,
          stripePaymentIntentId:
            invoice?.stripe_payment_intent_id ??
            payment?.provider_payment_id ??
            null,
          stripeCheckoutSessionId:
            invoice?.stripe_checkout_session_id ??
            transaction.provider_reference,
          invoice,
        };
      })
      .filter((row) => {
        if (status === "all") return true;
        if (status === "not_generated") return !row.invoice;
        if (status === "ready") {
          return Boolean(
            row.invoice &&
              ["ready", "downloaded"].includes(row.invoice.status),
          );
        }
        return row.invoice?.status === status;
      });
    const rows = filteredRows.slice(pagination.from, pagination.to + 1);

    const invoiceStatuses = allInvoiceResult.data ?? [];

    return NextResponse.json({
      storageReady: true,
      rows,
      stats: {
        completedTopUps: (transactions ?? []).length,
        ready: invoiceStatuses.filter((item) =>
          ["ready", "downloaded"].includes(item.status),
        ).length,
        imported: invoiceStatuses.filter((item) =>
          ["imported", "sent"].includes(item.status),
        ).length,
        errors: invoiceStatuses.filter((item) => item.status === "error")
          .length,
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

function emptyStats() {
  return {
    completedTopUps: 0,
    ready: 0,
    imported: 0,
    errors: 0,
  };
}
