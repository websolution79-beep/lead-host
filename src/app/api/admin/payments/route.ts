import { NextResponse, type NextRequest } from "next/server";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";

type PaymentRow = {
  id: string;
  provider: string;
  provider_payment_id: string | null;
  provider_checkout_session_id: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  created_at: string;
  confirmed_at: string | null;
};

type WalletTransactionRow = {
  id: string;
  profile_id: string;
  type: "top_up" | "lead_purchase" | "refund" | "adjustment";
  status: "pending" | "completed" | "failed" | "cancelled";
  amount_cents: number;
  balance_after_cents: number | null;
  description: string | null;
  provider: string | null;
  provider_reference: string | null;
  lead_purchase_id: string | null;
  created_at: string;
  completed_at: string | null;
};

type LeadPurchaseRow = {
  id: string;
  lead_id: string;
  property_manager_id: string;
  mode: "shared" | "exclusive";
  amount_cents: number;
  status: string;
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const paymentsTable = supabase.from("payments" as never) as unknown as {
      select: (columns: string) => {
        order: (
          column: string,
          options: { ascending: boolean },
        ) => {
          limit: (count: number) => Promise<{
            data: PaymentRow[] | null;
            error: { message?: string } | null;
          }>;
        };
      };
    };

    const [
      paymentsResult,
      walletTransactionsResult,
      leadPurchasesResult,
    ] = await Promise.all([
      paymentsTable
        .select(
          "id,provider,provider_payment_id,provider_checkout_session_id,amount_cents,currency,status,created_at,confirmed_at",
        )
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("wallet_transactions")
        .select(
          "id,profile_id,type,status,amount_cents,balance_after_cents,description,provider,provider_reference,lead_purchase_id,created_at,completed_at",
        )
        .order("created_at", { ascending: false })
        .limit(150),
      supabase
        .from("lead_purchases")
        .select("id,lead_id,property_manager_id,mode,amount_cents,status,created_at")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    if (paymentsResult.error) throw paymentsResult.error;
    if (walletTransactionsResult.error) throw walletTransactionsResult.error;
    if (leadPurchasesResult.error) throw leadPurchasesResult.error;

    const walletTransactions = (walletTransactionsResult.data ?? []) as WalletTransactionRow[];
    const leadPurchases = (leadPurchasesResult.data ?? []) as LeadPurchaseRow[];
    const profileIds = Array.from(new Set(walletTransactions.map((item) => item.profile_id)));
    const propertyManagerIds = Array.from(
      new Set(leadPurchases.map((item) => item.property_manager_id)),
    );
    const leadIds = Array.from(new Set(leadPurchases.map((item) => item.lead_id)));

    const [
      profilesResult,
      managersResult,
      leadsResult,
    ] = await Promise.all([
      profileIds.length
        ? supabase
            .from("profiles")
            .select("id,email,first_name,last_name")
            .in("id", profileIds)
        : Promise.resolve({ data: [], error: null }),
      propertyManagerIds.length
        ? supabase
            .from("property_manager_profiles")
            .select("id,profile_id,company_name")
            .in("id", propertyManagerIds)
        : Promise.resolve({ data: [], error: null }),
      leadIds.length
        ? supabase.from("leads").select("id,title").in("id", leadIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (managersResult.error) throw managersResult.error;
    if (leadsResult.error) throw leadsResult.error;

    const profilesById = new Map((profilesResult.data ?? []).map((item) => [item.id, item]));
    const managersById = new Map((managersResult.data ?? []).map((item) => [item.id, item]));
    const leadTitleById = new Map((leadsResult.data ?? []).map((item) => [item.id, item.title]));
    const pmProfileIds = Array.from(
      new Set((managersResult.data ?? []).map((item) => item.profile_id)),
    );
    const pmProfilesResult = pmProfileIds.length
      ? await supabase
          .from("profiles")
          .select("id,email,first_name,last_name")
          .in("id", pmProfileIds)
      : { data: [], error: null };

    if (pmProfilesResult.error) throw pmProfilesResult.error;

    const pmProfilesById = new Map((pmProfilesResult.data ?? []).map((item) => [item.id, item]));
    const walletTransactionByCheckoutSessionId = new Map(
      walletTransactions
        .filter((transaction) => Boolean(transaction.provider_reference))
        .map((transaction) => [transaction.provider_reference as string, transaction]),
    );
    const completedTopUps = walletTransactions.filter(
      (item) => item.type === "top_up" && item.status === "completed",
    );
    const completedRefunds = walletTransactions.filter(
      (item) => item.type === "refund" && item.status === "completed",
    );
    const activeLeadPurchases = leadPurchases.filter((item) =>
      ["paid", "contact_unlocked"].includes(item.status),
    );

    return NextResponse.json({
      stats: {
        topUpsCents: sumCents(completedTopUps.map((item) => item.amount_cents)),
        leadSalesCents: sumCents(activeLeadPurchases.map((item) => item.amount_cents)),
        refundsCents: sumCents(completedRefunds.map((item) => item.amount_cents)),
        failedPayments: (paymentsResult.data ?? []).filter((item) =>
          ["failed", "cancelled"].includes(item.status),
        ).length,
        pendingTopUps: walletTransactions.filter(
          (item) => item.type === "top_up" && item.status === "pending",
        ).length,
      },
      payments: (paymentsResult.data ?? []).map((payment) => {
        const walletTransaction = payment.provider_checkout_session_id
          ? walletTransactionByCheckoutSessionId.get(payment.provider_checkout_session_id)
          : null;
        const profile = walletTransaction
          ? profilesById.get(walletTransaction.profile_id)
          : null;

        return {
          id: payment.id,
          provider: payment.provider,
          providerPaymentId: payment.provider_payment_id,
          providerCheckoutSessionId: payment.provider_checkout_session_id,
          propertyManagerName:
            [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
            profile?.email ||
            "Property Manager non associato",
          propertyManagerEmail: profile?.email ?? null,
          amountCents: payment.amount_cents,
          currency: payment.currency,
          status: payment.status,
          createdAt: payment.created_at,
          confirmedAt: payment.confirmed_at,
        };
      }),
      walletTransactions: walletTransactions.map((transaction) => {
        const profile = profilesById.get(transaction.profile_id);

        return {
          id: transaction.id,
          profileEmail: profile?.email ?? null,
          profileName:
            [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
            profile?.email ||
            "Profilo",
          type: transaction.type,
          status: transaction.status,
          amountCents: transaction.amount_cents,
          balanceAfterCents: transaction.balance_after_cents,
          description: transaction.description,
          provider: transaction.provider,
          providerReference: transaction.provider_reference,
          leadPurchaseId: transaction.lead_purchase_id,
          createdAt: transaction.created_at,
          completedAt: transaction.completed_at,
        };
      }),
      leadPurchases: leadPurchases.map((purchase) => {
        const manager = managersById.get(purchase.property_manager_id);
        const profile = manager ? pmProfilesById.get(manager.profile_id) : null;

        return {
          id: purchase.id,
          leadTitle: leadTitleById.get(purchase.lead_id) ?? "Lead acquistato",
          propertyManagerName:
            manager?.company_name ||
            [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
            profile?.email ||
            "Property Manager",
          propertyManagerEmail: profile?.email ?? null,
          mode: purchase.mode,
          amountCents: purchase.amount_cents,
          status: purchase.status,
          createdAt: purchase.created_at,
        };
      }),
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

function sumCents(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
