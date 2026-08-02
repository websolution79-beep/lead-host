import { NextResponse, type NextRequest } from "next/server";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import { buildPagination, readPagination } from "@/lib/api/pagination";

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

type AddonPaymentRow = {
  id: string;
  profile_id: string;
  payment_kind: "initial" | "renewal" | "adjustment";
  provider_invoice_id: string | null;
  provider_payment_intent_id: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  paid_at: string | null;
  created_at: string;
};

type PaymentQueryResult<T> = {
  data: T[] | null;
  error: { message?: string } | null;
  count: number | null;
};

type PaymentsTable = {
  select: (
    columns: string,
    options?: { count?: "exact"; head?: boolean },
  ) => {
    order: (
      column: string,
      options: { ascending: boolean },
    ) => {
      range: (from: number, to: number) => Promise<PaymentQueryResult<PaymentRow>>;
    };
    limit: (count: number) => Promise<PaymentQueryResult<Pick<PaymentRow, "status">>>;
  };
};

type ActiveTab = "payments" | "wallet" | "lead_purchases" | "addon_payments";

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const pagination = readPagination(request.nextUrl.searchParams);
    const requestedTab = request.nextUrl.searchParams.get("tab");
    const activeTab: ActiveTab =
      requestedTab === "wallet" ||
      requestedTab === "lead_purchases" ||
      requestedTab === "addon_payments"
        ? requestedTab
        : "payments";
    const paymentsTable = supabase.from("payments" as never) as unknown as PaymentsTable;

    const [
      paymentStatsResult,
      walletStatsResult,
      purchaseStatsResult,
      addonStatsResult,
      activeResult,
    ] = await Promise.all([
      paymentsTable.select("status").limit(1000),
      supabase
        .from("wallet_transactions")
        .select("type,status,amount_cents")
        .limit(1000),
      supabase
        .from("lead_purchases")
        .select("status,amount_cents")
        .limit(1000),
      supabase
        .from("addon_payments")
        .select("status,amount_cents")
        .limit(1000),
      fetchActiveRows(
        supabase,
        paymentsTable,
        activeTab,
        pagination.from,
        pagination.to,
      ),
    ]);

    if (paymentStatsResult.error) throw paymentStatsResult.error;
    if (walletStatsResult.error) throw walletStatsResult.error;
    if (purchaseStatsResult.error) throw purchaseStatsResult.error;
    if (addonStatsResult.error) throw addonStatsResult.error;
    if (activeResult.error) throw activeResult.error;

    const walletStats = walletStatsResult.data ?? [];
    const purchaseStats = purchaseStatsResult.data ?? [];
    const completedTopUps = walletStats.filter(
      (item) => item.type === "top_up" && item.status === "completed",
    );
    const completedRefunds = walletStats.filter(
      (item) => item.type === "refund" && item.status === "completed",
    );
    const activeLeadPurchases = purchaseStats.filter((item) =>
      ["paid", "contact_unlocked"].includes(item.status),
    );
    const addonStats = addonStatsResult.data ?? [];
    const payments =
      activeTab === "payments" ? (activeResult.data as PaymentRow[]) : [];
    const walletTransactions =
      activeTab === "wallet"
        ? (activeResult.data as WalletTransactionRow[])
        : [];
    const leadPurchases =
      activeTab === "lead_purchases"
        ? (activeResult.data as LeadPurchaseRow[])
        : [];
    const addonPayments =
      activeTab === "addon_payments"
        ? (activeResult.data as AddonPaymentRow[])
        : [];

    const paymentTransactionByReference =
      activeTab === "payments"
        ? await fetchPaymentTransactions(supabase, payments)
        : new Map<string, WalletTransactionRow>();
    const profileIds = Array.from(
      new Set(
        [
          ...walletTransactions.map((item) => item.profile_id),
          ...addonPayments.map((item) => item.profile_id),
          ...Array.from(paymentTransactionByReference.values()).map(
            (item) => item.profile_id,
          ),
        ].filter(Boolean),
      ),
    );
    const propertyManagerIds = Array.from(
      new Set(leadPurchases.map((item) => item.property_manager_id)),
    );
    const leadIds = Array.from(
      new Set(leadPurchases.map((item) => item.lead_id)),
    );

    const [profilesResult, managersResult, leadsResult] = await Promise.all([
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

    const managerProfileIds = Array.from(
      new Set((managersResult.data ?? []).map((item) => item.profile_id)),
    );
    const managerProfilesResult = managerProfileIds.length
      ? await supabase
          .from("profiles")
          .select("id,email,first_name,last_name")
          .in("id", managerProfileIds)
      : { data: [], error: null };

    if (managerProfilesResult.error) throw managerProfilesResult.error;

    const profilesById = new Map(
      (profilesResult.data ?? []).map((item) => [item.id, item]),
    );
    const managersById = new Map(
      (managersResult.data ?? []).map((item) => [item.id, item]),
    );
    const managerProfilesById = new Map(
      (managerProfilesResult.data ?? []).map((item) => [item.id, item]),
    );
    const leadTitleById = new Map(
      (leadsResult.data ?? []).map((item) => [item.id, item.title]),
    );

    return NextResponse.json(
      {
        stats: {
          topUpsCents: sumCents(
            completedTopUps.map((item) => item.amount_cents),
          ),
          leadSalesCents: sumCents(
            activeLeadPurchases.map((item) => item.amount_cents),
          ),
          refundsCents: sumCents(
            completedRefunds.map((item) => item.amount_cents),
          ),
          failedPayments: (paymentStatsResult.data ?? []).filter((item) =>
            ["failed", "cancelled"].includes(item.status),
          ).length,
          pendingTopUps: walletStats.filter(
            (item) => item.type === "top_up" && item.status === "pending",
          ).length,
          addonSalesCents: sumCents(
            addonStats
              .filter((item) => item.status === "paid")
              .map((item) => item.amount_cents),
          ),
          addonFailedPayments: addonStats.filter((item) =>
            ["failed", "uncollectible"].includes(item.status),
          ).length,
        },
        pagination: buildPagination(
          pagination.page,
          pagination.pageSize,
          activeResult.count ?? 0,
        ),
        payments: payments.map((payment) => {
          const transaction = payment.provider_checkout_session_id
            ? paymentTransactionByReference.get(
                payment.provider_checkout_session_id,
              )
            : null;
          const profile = transaction
            ? profilesById.get(transaction.profile_id)
            : null;

          return {
            id: payment.id,
            provider: payment.provider,
            providerPaymentId: payment.provider_payment_id,
            providerCheckoutSessionId:
              payment.provider_checkout_session_id,
            propertyManagerName: formatProfileName(
              profile,
              "Property Manager non associato",
            ),
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
            profileName: formatProfileName(profile, "Profilo"),
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
          const profile = manager
            ? managerProfilesById.get(manager.profile_id)
            : null;

          return {
            id: purchase.id,
            leadTitle:
              leadTitleById.get(purchase.lead_id) ?? "Lead acquistato",
            propertyManagerName:
              manager?.company_name ||
              formatProfileName(profile, "Property Manager"),
            propertyManagerEmail: profile?.email ?? null,
            mode: purchase.mode,
            amountCents: purchase.amount_cents,
            status: purchase.status,
            createdAt: purchase.created_at,
          };
        }),
        addonPayments: addonPayments.map((payment) => {
          const profile = profilesById.get(payment.profile_id);
          return {
            id: payment.id,
            productName: "Modulo Marketing",
            propertyManagerName: formatProfileName(profile, "Property Manager"),
            propertyManagerEmail: profile?.email ?? null,
            paymentKind: payment.payment_kind,
            providerInvoiceId: payment.provider_invoice_id,
            providerPaymentIntentId: payment.provider_payment_intent_id,
            amountCents: payment.amount_cents,
            currency: payment.currency,
            status: payment.status,
            paidAt: payment.paid_at,
            createdAt: payment.created_at,
          };
        }),
      },
      {
        headers: {
          "Cache-Control": "private, max-age=10, stale-while-revalidate=30",
        },
      },
    );
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

async function fetchActiveRows(
  supabase: Awaited<ReturnType<typeof requireSuperAdmin>>["supabase"],
  paymentsTable: PaymentsTable,
  activeTab: ActiveTab,
  from: number,
  to: number,
) {
  if (activeTab === "payments") {
    return paymentsTable
      .select(
        "id,provider,provider_payment_id,provider_checkout_session_id,amount_cents,currency,status,created_at,confirmed_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(from, to);
  }

  if (activeTab === "wallet") {
    return supabase
      .from("wallet_transactions")
      .select(
        "id,profile_id,type,status,amount_cents,balance_after_cents,description,provider,provider_reference,lead_purchase_id,created_at,completed_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(from, to);
  }

  if (activeTab === "addon_payments") {
    return supabase
      .from("addon_payments")
      .select(
        "id,profile_id,payment_kind,provider_invoice_id,provider_payment_intent_id,amount_cents,currency,status,paid_at,created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(from, to);
  }

  return supabase
    .from("lead_purchases")
    .select(
      "id,lead_id,property_manager_id,mode,amount_cents,status,created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);
}

async function fetchPaymentTransactions(
  supabase: Awaited<ReturnType<typeof requireSuperAdmin>>["supabase"],
  payments: PaymentRow[],
) {
  const references = payments
    .map((payment) => payment.provider_checkout_session_id)
    .filter((reference): reference is string => Boolean(reference));

  if (!references.length) {
    return new Map<string, WalletTransactionRow>();
  }

  const { data, error } = await supabase
    .from("wallet_transactions")
    .select(
      "id,profile_id,type,status,amount_cents,balance_after_cents,description,provider,provider_reference,lead_purchase_id,created_at,completed_at",
    )
    .in("provider_reference", references);

  if (error) throw error;

  return new Map(
    ((data ?? []) as WalletTransactionRow[])
      .filter(
        (
          transaction,
        ): transaction is WalletTransactionRow & {
          provider_reference: string;
        } => Boolean(transaction.provider_reference),
      )
      .map((transaction) => [
        transaction.provider_reference,
        transaction,
      ]),
  );
}

function formatProfileName(
  profile:
    | {
        email: string;
        first_name: string | null;
        last_name: string | null;
      }
    | null
    | undefined,
  fallback: string,
) {
  return (
    [profile?.first_name, profile?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    profile?.email ||
    fallback
  );
}

function sumCents(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
