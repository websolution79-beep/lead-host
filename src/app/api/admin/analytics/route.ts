import { NextResponse, type NextRequest } from "next/server";
import {
  resolveAnalyticsRange,
  type AnalyticsRangeKey,
  type BusinessAnalyticsPayload,
} from "@/lib/admin/business-analytics";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";

const ALLOWED_RANGES = new Set<AnalyticsRangeKey>([
  "today",
  "yesterday",
  "last7",
  "last30",
  "currentMonth",
  "previousMonth",
  "currentYear",
  "custom",
]);

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const requestedRange =
      request.nextUrl.searchParams.get("range") ?? "last7";
    const rangeKey = ALLOWED_RANGES.has(requestedRange as AnalyticsRangeKey)
      ? (requestedRange as AnalyticsRangeKey)
      : "last7";
    const range = resolveAnalyticsRange({
      key: rangeKey,
      customFrom: request.nextUrl.searchParams.get("from"),
      customTo: request.nextUrl.searchParams.get("to"),
    });
    const [
      analyticsResult,
      newLeadCountResult,
      currentPrimeResult,
      previousPrimeResult,
      primeAccountsResult,
      primeSubscriptionsResult,
    ] = await Promise.all([
      supabase.rpc("get_admin_business_analytics", {
        p_from_date: range.fromDate,
        p_to_date: range.toDateExclusive,
        p_previous_from_date: range.previousFromDate,
        p_previous_to_date: range.previousToDate,
        p_bucket: range.bucket,
      }),
      supabase
        .from("owner_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "to_verify"),
      supabase
        .from("prime_billing_periods")
        .select("profile_id,period_kind,status,membership_amount_cents,wallet_recharge_amount_cents,total_amount_cents,created_at")
        .gte("created_at", range.fromDate)
        .lt("created_at", range.toDateExclusive),
      supabase
        .from("prime_billing_periods")
        .select("profile_id,period_kind,status,membership_amount_cents,wallet_recharge_amount_cents,total_amount_cents,created_at")
        .gte("created_at", range.previousFromDate)
        .lt("created_at", range.previousToDate),
      supabase
        .from("prime_accounts")
        .select("status,access_source,prime_started_at,addon_subscription_id"),
      supabase
        .from("addon_subscriptions")
        .select("id,cancel_at_period_end"),
    ]);
    const { data, error } = analyticsResult;

    if (error) {
      if (
        error.code === "PGRST202"
        || error.message.includes("get_admin_business_analytics")
      ) {
        return NextResponse.json(
          {
            error:
              "Analytics non ancora aggiornati nel database. Applica la migration admin_business_analytics.",
          },
          { status: 503 },
        );
      }

      throw error;
    }

    const analytics = data as unknown as Omit<
      BusinessAnalyticsPayload,
      "range"
    >;

    if (newLeadCountResult.error) throw newLeadCountResult.error;
    if (currentPrimeResult.error) throw currentPrimeResult.error;
    if (previousPrimeResult.error) throw previousPrimeResult.error;
    if (primeAccountsResult.error) throw primeAccountsResult.error;
    if (primeSubscriptionsResult.error) throw primeSubscriptionsResult.error;

    analytics.snapshot.pendingReview = newLeadCountResult.count ?? 0;
    const subscriptionById = new Map(
      (primeSubscriptionsResult.data ?? []).map((subscription) => [subscription.id, subscription]),
    );
    const subscriberAccounts = (primeAccountsResult.data ?? []).filter((account) =>
      account.access_source !== "none" && account.prime_started_at,
    );
    const prime = {
      current: summarizePrime(currentPrimeResult.data ?? []),
      previous: summarizePrime(previousPrimeResult.data ?? []),
      snapshot: {
        active: subscriberAccounts.filter((account) => account.status === "active").length,
        pastDue: subscriberAccounts.filter((account) => account.status === "past_due").length,
        cancelAtPeriodEnd: subscriberAccounts.filter((account) =>
          Boolean(account.addon_subscription_id && subscriptionById.get(account.addon_subscription_id)?.cancel_at_period_end),
        ).length,
        cancelled: subscriberAccounts.filter((account) => account.status === "cancelled").length,
      },
    };

    return NextResponse.json(
      {
        ...analytics,
        prime,
        range: {
          key: range.key,
          label: range.label,
          fromDate: range.fromDate,
          toDate: range.toDate,
          previousFromDate: range.previousFromDate,
          previousToDate: range.previousToDate,
          bucket: range.bucket,
        },
      } satisfies BusinessAnalyticsPayload,
      {
        headers: {
          "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
        },
      },
    );
  } catch (error) {
    if (
      error instanceof Error
      && [
        "Seleziona",
        "La data iniziale",
        "Il periodo massimo",
      ].some((prefix) => error.message.startsWith(prefix))
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return adminApiErrorResponse(error);
  }
}

function summarizePrime(rows: Array<{
  profile_id: string;
  period_kind: string;
  status: string;
  membership_amount_cents: number;
  wallet_recharge_amount_cents: number;
  total_amount_cents: number;
}>) {
  const paid = rows.filter((row) => row.status === "paid");
  return {
    activations: paid.filter((row) => row.period_kind === "initial").length,
    renewals: paid.filter((row) => row.period_kind === "renewal").length,
    uniquePropertyManagers: new Set(paid.map((row) => row.profile_id)).size,
    membershipCents: paid.reduce((total, row) => total + row.membership_amount_cents, 0),
    walletRechargeCents: paid.reduce((total, row) => total + row.wallet_recharge_amount_cents, 0),
    totalPaidCents: paid.reduce((total, row) => total + row.total_amount_cents, 0),
  };
}
