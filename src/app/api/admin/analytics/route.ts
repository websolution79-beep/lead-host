import { NextResponse, type NextRequest } from "next/server";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import type { Json } from "@/lib/supabase/database.types";

type OwnerRequestRow = {
  id: string;
  status: string;
  acquisition_channel: string;
  duplicate_check: Json;
  created_at: string;
};

type LeadRow = {
  id: string;
  owner_request_id: string;
  property_id: string;
  internal_status: string;
  public_status: string;
  published_at: string | null;
  created_at: string;
};

type PropertyRow = {
  id: string;
  city: string | null;
  province: string | null;
  region: string | null;
  requested_services: string[];
};

type LeadPurchaseRow = {
  id: string;
  lead_id: string;
  mode: "shared" | "exclusive";
  amount_cents: number;
  status: string;
  created_at: string;
};

type WalletTransactionRow = {
  id: string;
  type: "top_up" | "lead_purchase" | "refund" | "adjustment";
  status: string;
  amount_cents: number;
  created_at: string;
};

type ReportRow = {
  id: string;
  status: string;
  created_at: string;
};

type RefundRow = {
  id: string;
  status: string;
  amount_cents: number | null;
  created_at: string;
};

type EmailLogRow = {
  id: string;
  event_type: string;
  status: string;
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const [
      ownerRequestsResult,
      leadsResult,
      propertiesResult,
      purchasesResult,
      walletTransactionsResult,
      reportsResult,
      propertyManagersResult,
      profilesResult,
      refundsResult,
      emailLogsResult,
    ] = await Promise.all([
      supabase
        .from("owner_requests")
        .select("id,status,acquisition_channel,duplicate_check,created_at")
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("leads")
        .select("id,owner_request_id,property_id,internal_status,public_status,published_at,created_at")
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("properties")
        .select("id,city,province,region,requested_services")
        .limit(1000),
      supabase
        .from("lead_purchases")
        .select("id,lead_id,mode,amount_cents,status,created_at")
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("wallet_transactions")
        .select("id,type,status,amount_cents,created_at")
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("reports")
        .select("id,status,created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("property_manager_profiles")
        .select("id,verification_status,created_at")
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("profiles")
        .select("id,status,created_at")
        .order("created_at", { ascending: false })
        .limit(1000),
      fetchRefunds(supabase),
      fetchEmailLogs(supabase),
    ]);

    if (ownerRequestsResult.error) throw ownerRequestsResult.error;
    if (leadsResult.error) throw leadsResult.error;
    if (propertiesResult.error) throw propertiesResult.error;
    if (purchasesResult.error) throw purchasesResult.error;
    if (walletTransactionsResult.error) throw walletTransactionsResult.error;
    if (reportsResult.error) throw reportsResult.error;
    if (propertyManagersResult.error) throw propertyManagersResult.error;
    if (profilesResult.error) throw profilesResult.error;

    const ownerRequests = (ownerRequestsResult.data ?? []) as OwnerRequestRow[];
    const leads = (leadsResult.data ?? []) as LeadRow[];
    const properties = (propertiesResult.data ?? []) as PropertyRow[];
    const purchases = (purchasesResult.data ?? []) as LeadPurchaseRow[];
    const walletTransactions = (walletTransactionsResult.data ?? []) as WalletTransactionRow[];
    const reports = (reportsResult.data ?? []) as ReportRow[];
    const refunds = refundsResult.data;
    const emailLogs = emailLogsResult.data;
    const now = new Date();
    const todayStart = startOfDay(now);
    const monthStart = startOfMonth(now);
    const last7Days = getLastDays(7);
    const propertyById = new Map(properties.map((property) => [property.id, property]));
    const activePurchases = purchases.filter((purchase) =>
      ["paid", "contact_unlocked"].includes(purchase.status),
    );
    const activeLeadIds = new Set(activePurchases.map((purchase) => purchase.lead_id));
    const soldLeads = leads.filter((lead) => activeLeadIds.has(lead.id));
    const publishedLeads = leads.filter((lead) => Boolean(lead.published_at));
    const completedTopUps = walletTransactions.filter(
      (transaction) => transaction.type === "top_up" && transaction.status === "completed",
    );
    const completedRefunds = refunds.filter((refund) => refund.status === "paid");
    const leadRevenueCents = sumCents(activePurchases.map((purchase) => purchase.amount_cents));
    const monthLeadRevenueCents = sumCents(
      activePurchases
        .filter((purchase) => isSameOrAfter(purchase.created_at, monthStart))
        .map((purchase) => purchase.amount_cents),
    );
    const topUpCents = sumCents(completedTopUps.map((transaction) => transaction.amount_cents));
    const refundCents = sumCents(completedRefunds.map((refund) => refund.amount_cents ?? 0));
    const pendingStatuses = new Set(["pending", "to_verify"]);
    const duplicateWarnings = ownerRequests.filter((item) =>
      ["duplicate", "possible_duplicate"].includes(readDuplicateStatus(item.duplicate_check)),
    );

    return NextResponse.json({
      generatedAt: now.toISOString(),
      dashboard: {
        kpis: {
          acquiredToday: countSince(ownerRequests, todayStart),
          pendingReview: ownerRequests.filter((item) => pendingStatuses.has(item.status)).length,
          publishedLeads: publishedLeads.length,
          monthRevenueCents: monthLeadRevenueCents,
        },
        queues: {
          waitingCompletion: ownerRequests.filter((item) => item.status === "waiting_for_completion").length,
          duplicateWarnings: duplicateWarnings.length,
          openReports: reports.filter((item) => ["pending", "reviewing"].includes(item.status)).length,
          pendingRefunds: refunds.filter((item) => ["pending", "approved"].includes(item.status)).length,
        },
        recentActivity: buildRecentActivity({
          ownerRequests,
          leads,
          purchases: activePurchases,
          walletTransactions: completedTopUps,
          reports,
        }),
      },
      analytics: {
        totals: {
          ownerRequests: ownerRequests.length,
          propertyManagers: propertyManagersResult.data?.length ?? 0,
          activeProfiles: (profilesResult.data ?? []).filter((profile) => profile.status === "active").length,
          publishedLeads: publishedLeads.length,
          soldLeads: soldLeads.length,
          leadPurchases: activePurchases.length,
          leadRevenueCents,
          topUpCents,
          refundCents,
          netWalletMovementCents: topUpCents - refundCents,
          averageLeadRevenueCents: activePurchases.length
            ? Math.round(leadRevenueCents / activePurchases.length)
            : 0,
          publicationRate: ratio(publishedLeads.length, ownerRequests.length),
          salesRate: ratio(soldLeads.length, publishedLeads.length),
        },
        funnel: [
          { label: "Acquisiti", value: ownerRequests.length },
          {
            label: "Completati",
            value: ownerRequests.filter((item) => !["waiting_for_completion", "new_from_meta"].includes(item.status)).length,
          },
          {
            label: "Da verificare",
            value: ownerRequests.filter((item) => pendingStatuses.has(item.status)).length,
          },
          { label: "Pubblicati", value: publishedLeads.length },
          { label: "Venduti", value: soldLeads.length },
        ],
        acquisitionByChannel: groupCount(ownerRequests, (item) => item.acquisition_channel),
        leadStatus: groupCount(leads, (item) => item.internal_status),
        revenueByMode: [
          {
            label: "Condiviso",
            valueCents: sumCents(
              activePurchases
                .filter((purchase) => purchase.mode === "shared")
                .map((purchase) => purchase.amount_cents),
            ),
            count: activePurchases.filter((purchase) => purchase.mode === "shared").length,
          },
          {
            label: "Esclusivo",
            valueCents: sumCents(
              activePurchases
                .filter((purchase) => purchase.mode === "exclusive")
                .map((purchase) => purchase.amount_cents),
            ),
            count: activePurchases.filter((purchase) => purchase.mode === "exclusive").length,
          },
        ],
        last7Days: last7Days.map((day) => ({
          label: formatShortDay(day),
          acquired: ownerRequests.filter((item) => isSameDay(item.created_at, day)).length,
          published: leads.filter(
            (item) => item.published_at && isSameDay(item.published_at, day),
          ).length,
          purchases: activePurchases.filter((item) => isSameDay(item.created_at, day)).length,
          revenueCents: sumCents(
            activePurchases
              .filter((item) => isSameDay(item.created_at, day))
              .map((item) => item.amount_cents),
          ),
        })),
        topCities: topCityRows({ leads: publishedLeads, propertyById }),
        topServices: topServices(properties),
        operations: {
          reportsByStatus: groupCount(reports, (item) => item.status),
          refundsByStatus: groupCount(refunds, (item) => item.status),
          emailsByStatus: groupCount(emailLogs, (item) => item.status),
        },
      },
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

function fetchRefunds(supabase: Awaited<ReturnType<typeof requireSuperAdmin>>["supabase"]) {
  const table = supabase.from("refunds" as never) as unknown as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => {
        limit: (count: number) => Promise<{
          data: RefundRow[] | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };

  return table
    .select("id,status,amount_cents,created_at")
    .order("created_at", { ascending: false })
    .limit(500)
    .then((result) => ({ data: result.error ? [] : result.data ?? [] }));
}

function fetchEmailLogs(supabase: Awaited<ReturnType<typeof requireSuperAdmin>>["supabase"]) {
  const table = supabase.from("email_delivery_logs" as never) as unknown as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => {
        limit: (count: number) => Promise<{
          data: EmailLogRow[] | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };

  return table
    .select("id,event_type,status,created_at")
    .order("created_at", { ascending: false })
    .limit(500)
    .then((result) => ({ data: result.error ? [] : result.data ?? [] }));
}

function buildRecentActivity({
  ownerRequests,
  leads,
  purchases,
  walletTransactions,
  reports,
}: {
  ownerRequests: OwnerRequestRow[];
  leads: LeadRow[];
  purchases: LeadPurchaseRow[];
  walletTransactions: WalletTransactionRow[];
  reports: ReportRow[];
}) {
  return [
    ...ownerRequests.slice(0, 8).map((item) => ({
      type: "Lead acquisito",
      label: `Richiesta ${item.acquisition_channel}`,
      detail: item.status,
      createdAt: item.created_at,
    })),
    ...leads.filter((item) => item.published_at).slice(0, 8).map((item) => ({
      type: "Lead pubblicato",
      label: `Lead ${item.id.slice(0, 8).toUpperCase()}`,
      detail: item.internal_status,
      createdAt: item.published_at ?? item.created_at,
    })),
    ...purchases.slice(0, 8).map((item) => ({
      type: "Acquisto lead",
      label: item.mode === "exclusive" ? "Esclusiva" : "Condiviso",
      detail: `${item.amount_cents}`,
      createdAt: item.created_at,
    })),
    ...walletTransactions.slice(0, 8).map((item) => ({
      type: "Ricarica wallet",
      label: "Credito aggiunto",
      detail: `${item.amount_cents}`,
      createdAt: item.created_at,
    })),
    ...reports.slice(0, 8).map((item) => ({
      type: "Segnalazione",
      label: item.status,
      detail: "Report PM",
      createdAt: item.created_at,
    })),
  ]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 8);
}

function topCityRows({
  leads,
  propertyById,
}: {
  leads: LeadRow[];
  propertyById: Map<string, PropertyRow>;
}) {
  const rows = leads
    .map((lead) => propertyById.get(lead.property_id))
    .filter((property): property is PropertyRow => Boolean(property?.city));

  return groupCount(rows, (property) => property.city ?? "Non indicata").slice(0, 8);
}

function topServices(properties: PropertyRow[]) {
  const rows = properties.flatMap((property) => property.requested_services ?? []);

  return groupCount(rows, (service) => service).slice(0, 8);
}

function groupCount<T>(items: T[], getKey: (item: T) => string | null | undefined) {
  const counts = new Map<string, number>();

  for (const item of items) {
    const key = getKey(item)?.trim() || "Non indicato";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function readDuplicateStatus(value: Json) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";

  const status = (value as Record<string, Json>).status;

  return typeof status === "string" ? status : "";
}

function countSince(items: Array<{ created_at: string }>, date: Date) {
  return items.filter((item) => isSameOrAfter(item.created_at, date)).length;
}

function isSameOrAfter(value: string, date: Date) {
  return Date.parse(value) >= date.getTime();
}

function isSameDay(value: string, day: Date) {
  const date = new Date(value);

  return (
    date.getFullYear() === day.getFullYear() &&
    date.getMonth() === day.getMonth() &&
    date.getDate() === day.getDate()
  );
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function getLastDays(days: number) {
  const today = startOfDay(new Date());

  return Array.from({ length: days }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (days - 1 - index));

    return day;
  });
}

function formatShortDay(value: Date) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
  }).format(value);
}

function ratio(part: number, total: number) {
  if (!total) return 0;

  return Math.round((part / total) * 100);
}

function sumCents(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
