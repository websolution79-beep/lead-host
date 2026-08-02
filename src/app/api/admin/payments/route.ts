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
  subscription_id: string | null;
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

type AddonSubscriptionRow = {
  id: string;
  addon_product_id: string;
  profile_id: string;
  status: string;
  source: "stripe" | "manual";
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  current_period_started_at: string | null;
  current_period_ends_at: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  access_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

type AddonProductRow = {
  id: string;
  name: string;
  sale_price_cents: number | null;
  currency: string;
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
    const addonSubscriptions =
      activeTab === "addon_payments"
        ? (activeResult.data as AddonSubscriptionRow[])
        : [];

    const paymentTransactionByReference =
      activeTab === "payments"
        ? await fetchPaymentTransactions(supabase, payments)
        : new Map<string, WalletTransactionRow>();
    const profileIds = Array.from(
      new Set(
        [
          ...walletTransactions.map((item) => item.profile_id),
          ...addonSubscriptions.map((item) => item.profile_id),
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
    const addonProductIds = Array.from(
      new Set(addonSubscriptions.map((item) => item.addon_product_id)),
    );
    const addonSubscriptionIds = addonSubscriptions.map((item) => item.id);

    const [
      profilesResult,
      managersResult,
      leadsResult,
      addonProductsResult,
      addonPagePaymentsResult,
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
      addonProductIds.length
        ? supabase
            .from("addon_products")
            .select("id,name,sale_price_cents,currency")
            .in("id", addonProductIds)
        : Promise.resolve({ data: [], error: null }),
      addonSubscriptionIds.length
        ? supabase
            .from("addon_payments")
            .select(
              "id,subscription_id,profile_id,payment_kind,provider_invoice_id,provider_payment_intent_id,amount_cents,currency,status,paid_at,created_at",
            )
            .in("subscription_id", addonSubscriptionIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (managersResult.error) throw managersResult.error;
    if (leadsResult.error) throw leadsResult.error;
    if (addonProductsResult.error) throw addonProductsResult.error;
    if (addonPagePaymentsResult.error) throw addonPagePaymentsResult.error;

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
    const addonProductsById = new Map(
      ((addonProductsResult.data ?? []) as AddonProductRow[]).map((item) => [
        item.id,
        item,
      ]),
    );
    const addonPaymentsBySubscription = new Map<string, AddonPaymentRow[]>();
    for (const payment of (addonPagePaymentsResult.data ?? []) as AddonPaymentRow[]) {
      if (!payment.subscription_id) continue;
      const current = addonPaymentsBySubscription.get(payment.subscription_id) ?? [];
      current.push(payment);
      addonPaymentsBySubscription.set(payment.subscription_id, current);
    }

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
        addonCustomers: addonSubscriptions.map((subscription) => {
          const profile = profilesById.get(subscription.profile_id);
          const product = addonProductsById.get(subscription.addon_product_id);
          const subscriptionPayments =
            addonPaymentsBySubscription.get(subscription.id) ?? [];
          const paidPayments = subscriptionPayments.filter(
            (payment) => payment.status === "paid",
          );
          const lastPayment = [...paidPayments].sort((left, right) =>
            (right.paid_at ?? right.created_at).localeCompare(
              left.paid_at ?? left.created_at,
            ),
          )[0];
          const hasNextCharge =
            subscription.source === "stripe" &&
            !subscription.cancel_at_period_end &&
            ["trialing", "active", "past_due"].includes(subscription.status);

          return {
            id: subscription.id,
            profileId: subscription.profile_id,
            productName: product?.name ?? "Modulo Marketing",
            propertyManagerName: formatProfileName(profile, "Property Manager"),
            propertyManagerEmail: profile?.email ?? null,
            status: subscription.status,
            source: subscription.source,
            stripeCustomerId: subscription.stripe_customer_id,
            stripeSubscriptionId: subscription.stripe_subscription_id,
            stripePriceId: subscription.stripe_price_id,
            trialStartedAt: subscription.trial_started_at,
            trialEndsAt: subscription.trial_ends_at,
            currentPeriodStartedAt: subscription.current_period_started_at,
            currentPeriodEndsAt: subscription.current_period_ends_at,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            canceledAt: subscription.canceled_at,
            accessExpiresAt: subscription.access_expires_at,
            nextChargeAt: hasNextCharge
              ? subscription.status === "trialing"
                ? subscription.trial_ends_at
                : subscription.current_period_ends_at
              : null,
            nextChargeCents: hasNextCharge
              ? product?.sale_price_cents ?? null
              : null,
            currency: product?.currency ?? "eur",
            paymentCount: paidPayments.length,
            totalPaidCents: sumCents(
              paidPayments.map((payment) => payment.amount_cents),
            ),
            lastPaymentAt: lastPayment?.paid_at ?? lastPayment?.created_at ?? null,
            createdAt: subscription.created_at,
            updatedAt: subscription.updated_at,
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
      .from("addon_subscriptions")
      .select(
        "id,addon_product_id,profile_id,status,source,stripe_customer_id,stripe_subscription_id,stripe_price_id,trial_started_at,trial_ends_at,current_period_started_at,current_period_ends_at,cancel_at_period_end,canceled_at,access_expires_at,created_at,updated_at",
        { count: "exact" },
      )
      .order("updated_at", { ascending: false })
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
