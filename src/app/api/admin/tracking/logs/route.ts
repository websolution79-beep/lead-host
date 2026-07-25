import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import {
  trackingEventIds,
  trackingProviderIds,
} from "@/lib/config/tracking-settings";

const querySchema = z.object({
  provider: z.enum(trackingProviderIds).optional(),
  event: z.enum(trackingEventIds).optional(),
  status: z.enum(["queued", "sent", "failed", "skipped"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const queryInput = Object.fromEntries(request.nextUrl.searchParams.entries());
    const filters = querySchema.parse(queryInput);
    let query = supabase
      .from("tracking_event_logs")
      .select(
        "id,provider,event_name,event_id,source,status,page_path,value_cents,currency,metadata,error_message,occurred_at,sent_at,created_at,updated_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });

    if (filters.provider) {
      query = query.eq("provider", filters.provider);
    }
    if (filters.event) {
      query = query.eq("event_name", filters.event);
    }
    if (filters.status) {
      query = query.eq("status", filters.status);
    }

    const { data, error, count } = await query.range(
      filters.offset,
      filters.offset + filters.limit - 1,
    );

    if (error) throw error;

    return NextResponse.json(
      {
        records: data ?? [],
        total: count ?? 0,
        limit: filters.limit,
        offset: filters.offset,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
