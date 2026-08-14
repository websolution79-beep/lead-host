import { NextResponse, type NextRequest } from "next/server";
import { adminApiErrorResponse, requireAdminPermission } from "@/lib/admin/auth";

const purchaseStatuses = ["paid", "contact_unlocked", "refunded"] as const;

type RoleRow = { profile_id: string };
type ProfileRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  status: string;
  created_at: string;
};
type ManagerRow = { id: string; profile_id: string; primary_city: string | null };
type WalletRow = { profile_id: string; balance_cents: number; currency: string };
type ConsentRow = { profile_id: string; status: string };
type PurchaseRow = {
  id: string;
  property_manager_id: string;
  mode: string;
  status: string;
  amount_cents: number;
  created_at: string;
};
type WalletTransactionRow = {
  profile_id: string;
  type: string;
  status: string;
  amount_cents: number;
  completed_at: string | null;
  created_at: string;
};

function safeDate(value: string | null, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalize(value: string | null, max = 120) {
  return (value ?? "").trim().slice(0, max).toLocaleLowerCase("it-IT");
}

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireAdminPermission(
      request,
      "property_managers",
      "read",
    );
    const params = request.nextUrl.searchParams;
    const search = normalize(params.get("search"));
    const accountStatus = params.get("status") ?? "all";
    const consentStatus = params.get("consent") ?? "all";
    const mode = params.get("mode") ?? "all";
    const sort = params.get("sort") ?? "net_spend_desc";
    const buyersOnly = params.get("buyersOnly") !== "false";
    const exportAll = params.get("export") === "1";
    const minPurchases = Math.max(0, Number(params.get("minPurchases") || 0) || 0);
    const inactiveDays = Math.max(0, Number(params.get("inactiveDays") || 0) || 0);
    const dateFrom = safeDate(params.get("dateFrom"));
    const dateTo = safeDate(params.get("dateTo"), true);
    const page = Math.max(1, Number(params.get("page") || 1) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(params.get("pageSize") || 25) || 25));

    const { data: roleRows, error: rolesError } = await supabase
      .from("user_roles")
      .select("profile_id")
      .eq("role", "property_manager")
      .limit(5000);
    if (rolesError) throw rolesError;

    const profileIds = [
      ...new Set(((roleRows ?? []) as RoleRow[]).map((row) => row.profile_id)),
    ];
    if (!profileIds.length) {
      return NextResponse.json({
        records: [],
        topCustomers: [],
        summary: emptySummary(),
        pagination: { page: 1, pageSize, total: 0, totalPages: 1 },
      });
    }

    const [profilesResult, managersResult, walletsResult, consentResult] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("id,email,first_name,last_name,phone,status,created_at")
          .in("id", profileIds),
        supabase
          .from("property_manager_profiles")
          .select("id,profile_id,primary_city")
          .in("profile_id", profileIds),
        supabase
          .from("wallets")
          .select("profile_id,balance_cents,currency")
          .in("profile_id", profileIds),
        supabase
          .from("pm_marketing_preferences")
          .select("profile_id,status")
          .in("profile_id", profileIds),
      ]);

    if (profilesResult.error) throw profilesResult.error;
    if (managersResult.error) throw managersResult.error;
    if (walletsResult.error) throw walletsResult.error;
    if (consentResult.error) throw consentResult.error;

    const managerRows = (managersResult.data ?? []) as ManagerRow[];
    const managerIds = managerRows.map((row) => row.id);
    let purchaseRows: PurchaseRow[] = [];
    if (managerIds.length) {
      let purchasesQuery = supabase
        .from("lead_purchases")
        .select("id,property_manager_id,mode,status,amount_cents,created_at")
        .in("property_manager_id", managerIds)
        .in("status", [...purchaseStatuses])
        .order("created_at", { ascending: true })
        .limit(10000);
      if (dateFrom) purchasesQuery = purchasesQuery.gte("created_at", dateFrom);
      if (dateTo) purchasesQuery = purchasesQuery.lte("created_at", dateTo);
      if (mode === "shared" || mode === "exclusive") {
        purchasesQuery = purchasesQuery.eq("mode", mode);
      }
      const purchasesResult = await purchasesQuery;
      if (purchasesResult.error) throw purchasesResult.error;
      purchaseRows = (purchasesResult.data ?? []) as PurchaseRow[];
    }

    let walletQuery = supabase
      .from("wallet_transactions")
      .select("profile_id,type,status,amount_cents,completed_at,created_at")
      .in("profile_id", profileIds)
      .in("type", ["top_up", "refund"])
      .eq("status", "completed")
      .order("created_at", { ascending: true })
      .limit(10000);
    if (dateFrom) walletQuery = walletQuery.gte("completed_at", dateFrom);
    if (dateTo) walletQuery = walletQuery.lte("completed_at", dateTo);

    const walletTransactionsResult = await walletQuery;
    if (walletTransactionsResult.error) throw walletTransactionsResult.error;

    const profileRows = (profilesResult.data ?? []) as ProfileRow[];
    const walletRows = (walletsResult.data ?? []) as WalletRow[];
    const consentRows = (consentResult.data ?? []) as ConsentRow[];
    const walletTransactionRows = (walletTransactionsResult.data ?? []) as WalletTransactionRow[];

    const managersByProfile = new Map(
      managerRows.map((row) => [row.profile_id, row]),
    );
    const walletsByProfile = new Map(
      walletRows.map((row) => [row.profile_id, row]),
    );
    const consentByProfile = new Map(
      consentRows.map((row) => [row.profile_id, row.status]),
    );
    const purchasesByManager = new Map<string, PurchaseRow[]>();
    for (const purchase of purchaseRows) {
      const rows = purchasesByManager.get(purchase.property_manager_id) ?? [];
      rows.push(purchase);
      purchasesByManager.set(purchase.property_manager_id, rows);
    }
    const walletByProfile = new Map<string, WalletTransactionRow[]>();
    for (const transaction of walletTransactionRows) {
      const rows = walletByProfile.get(transaction.profile_id) ?? [];
      rows.push(transaction);
      walletByProfile.set(transaction.profile_id, rows);
    }

    let records = profileRows.map((profile) => {
      const manager = managersByProfile.get(profile.id);
      const purchases = manager ? purchasesByManager.get(manager.id) ?? [] : [];
      const walletTransactions = walletByProfile.get(profile.id) ?? [];
      const refunds = walletTransactions.filter((row) => row.type === "refund");
      const topUps = walletTransactions.filter((row) => row.type === "top_up");
      const grossSpentCents = purchases.reduce(
        (sum, purchase) => sum + purchase.amount_cents,
        0,
      );
      const refundCents = refunds.reduce(
        (sum, transaction) => sum + Math.abs(transaction.amount_cents),
        0,
      );
      const topUpCents = topUps.reduce(
        (sum, transaction) => sum + Math.abs(transaction.amount_cents),
        0,
      );
      const firstPurchaseAt = purchases[0]?.created_at ?? null;
      const lastPurchaseAt = purchases.at(-1)?.created_at ?? null;
      const displayName =
        [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
        profile.email;

      return {
        profileId: profile.id,
        email: profile.email,
        phone: profile.phone,
        displayName,
        primaryCity: manager?.primary_city || "Non indicata",
        accountStatus: profile.status,
        marketingConsent: consentByProfile.get(profile.id) ?? "not_granted",
        walletBalanceCents: walletsByProfile.get(profile.id)?.balance_cents ?? 0,
        currency: walletsByProfile.get(profile.id)?.currency ?? "eur",
        purchasesCount: purchases.length,
        sharedPurchasesCount: purchases.filter((row) => row.mode === "shared").length,
        exclusivePurchasesCount: purchases.filter((row) => row.mode === "exclusive").length,
        refundedPurchasesCount: purchases.filter((row) => row.status === "refunded").length,
        grossSpentCents,
        refundCents,
        netSpentCents: Math.max(0, grossSpentCents - refundCents),
        averagePurchaseCents: purchases.length
          ? Math.round(grossSpentCents / purchases.length)
          : 0,
        firstPurchaseAt,
        lastPurchaseAt,
        topUpsCount: topUps.length,
        topUpCents,
        firstTopUpAt: topUps[0]?.completed_at ?? topUps[0]?.created_at ?? null,
        lastTopUpAt:
          topUps.at(-1)?.completed_at ?? topUps.at(-1)?.created_at ?? null,
        createdAt: profile.created_at,
        rank: 0,
      };
    });

    records = records.filter((record) => {
      const matchesSearch =
        !search ||
        [record.displayName, record.email, record.phone, record.primaryCity].some(
          (value) => value?.toLocaleLowerCase("it-IT").includes(search),
        );
      const matchesStatus =
        accountStatus === "all" || record.accountStatus === accountStatus;
      const matchesConsent =
        consentStatus === "all" || record.marketingConsent === consentStatus;
      const matchesPurchases =
        (!buyersOnly || record.purchasesCount > 0) &&
        record.purchasesCount >= minPurchases;
      const matchesInactivity =
        !inactiveDays ||
        !record.lastPurchaseAt ||
        Date.now() - Date.parse(record.lastPurchaseAt) >= inactiveDays * 86_400_000;
      return (
        matchesSearch &&
        matchesStatus &&
        matchesConsent &&
        matchesPurchases &&
        matchesInactivity
      );
    });

    const ranking = [...records].sort(
      (a, b) =>
        b.netSpentCents - a.netSpentCents ||
        b.purchasesCount - a.purchasesCount ||
        Date.parse(b.lastPurchaseAt ?? "1970-01-01") -
          Date.parse(a.lastPurchaseAt ?? "1970-01-01"),
    );
    const rankByProfile = new Map(
      ranking.map((record, index) => [record.profileId, index + 1]),
    );
    records = records.map((record) => ({
      ...record,
      rank: rankByProfile.get(record.profileId) ?? 0,
    }));

    records.sort((a, b) => {
      if (sort === "purchases_desc") {
        return b.purchasesCount - a.purchasesCount || b.netSpentCents - a.netSpentCents;
      }
      if (sort === "last_purchase_desc") {
        return (
          Date.parse(b.lastPurchaseAt ?? "1970-01-01") -
          Date.parse(a.lastPurchaseAt ?? "1970-01-01")
        );
      }
      if (sort === "topups_desc") {
        return b.topUpCents - a.topUpCents || b.netSpentCents - a.netSpentCents;
      }
      return b.netSpentCents - a.netSpentCents || b.purchasesCount - a.purchasesCount;
    });

    const summary = records.reduce(
      (result, record) => ({
        customers: result.customers + 1,
        purchases: result.purchases + record.purchasesCount,
        grossSpentCents: result.grossSpentCents + record.grossSpentCents,
        refundsCents: result.refundsCents + record.refundCents,
        netSpentCents: result.netSpentCents + record.netSpentCents,
        topUpCents: result.topUpCents + record.topUpCents,
        averageCustomerValueCents: 0,
      }),
      emptySummary(),
    );
    const topCustomers = [...records]
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 5);
    const total = records.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const pagedRecords = exportAll
      ? records
      : records.slice((safePage - 1) * pageSize, safePage * pageSize);

    return NextResponse.json(
      {
        records: pagedRecords,
        topCustomers,
        summary: {
          ...summary,
          averageCustomerValueCents: summary.customers
            ? Math.round(summary.netSpentCents / summary.customers)
            : 0,
        },
        pagination: {
          page: safePage,
          pageSize,
          total,
          totalPages,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

function emptySummary() {
  return {
    customers: 0,
    purchases: 0,
    grossSpentCents: 0,
    refundsCents: 0,
    netSpentCents: 0,
    topUpCents: 0,
    averageCustomerValueCents: 0,
  };
}
