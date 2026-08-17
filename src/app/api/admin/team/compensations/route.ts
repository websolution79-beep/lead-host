import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";

const filtersSchema = z.object({
  status: z.enum(["accrued", "pending_attribution", "voided"]).optional(),
  eventType: z.enum([
    "lead_verification",
    "prime_first_activation",
    "prime_renewal",
    "prime_lead_purchase",
    "refund_adjustment",
    "manual_adjustment",
  ]).optional(),
  memberId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const assignSchema = z.object({
  eventId: z.string().uuid(),
  memberId: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const url = new URL(request.url);
    const filters = filtersSchema.parse({
      status: url.searchParams.get("status") || undefined,
      eventType: url.searchParams.get("eventType") || undefined,
      memberId: url.searchParams.get("memberId") || undefined,
      search: url.searchParams.get("search") || undefined,
      page: url.searchParams.get("page") || 1,
      pageSize: url.searchParams.get("pageSize") || 25,
    });
    const rpc = supabase as unknown as {
      rpc: (
        fn: "get_admin_team_compensation_dashboard",
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message?: string } | null }>;
    };
    const { data, error } = await rpc.rpc(
      "get_admin_team_compensation_dashboard",
      {
        p_status: filters.status ?? null,
        p_event_type: filters.eventType ?? null,
        p_member_id: filters.memberId ?? null,
        p_search: filters.search ?? null,
        p_page: filters.page,
        p_page_size: filters.pageSize,
      },
    );

    if (error || !data) {
      throw new Error(error?.message ?? "Compensi Team non disponibili.");
    }

    return NextResponse.json(data);
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile } = await requireSuperAdmin(request);
    const payload = assignSchema.parse(await request.json());
    const rpc = supabase as unknown as {
      rpc: (
        fn: "assign_pending_team_compensation_event",
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message?: string } | null }>;
    };
    const { data, error } = await rpc.rpc(
      "assign_pending_team_compensation_event",
      {
        p_event_id: payload.eventId,
        p_member_id: payload.memberId,
        p_actor_profile_id: profile.id,
      },
    );

    if (error || !data) {
      throw new Error(error?.message ?? "Compenso non attribuito.");
    }

    return NextResponse.json({ ok: true, event: data });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

