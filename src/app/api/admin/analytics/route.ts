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
    const [analyticsResult, newLeadCountResult] = await Promise.all([
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

    analytics.snapshot.pendingReview = newLeadCountResult.count ?? 0;

    return NextResponse.json(
      {
        ...analytics,
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
