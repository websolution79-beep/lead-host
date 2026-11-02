import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AdminApiError, adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";

const filtersSchema = z.object({
  status: z.enum(["accrued", "pending_attribution", "voided"]).optional(),
  eventType: z.enum([
    "lead_verification",
    "prime_first_activation",
    "prime_renewal",
    "prime_lead_purchase",
    "marketplace_promotion_sale",
    "marketplace_booking_call",
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
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message?: string } | null }>;
    };
    const events = supabase.from("team_compensation_events" as never) as unknown as {
      select: (fields: string) => { eq: (key: string, value: string) => { maybeSingle: () => PromiseLike<{
        data: { event_type: string; source_event_key: string; metadata: Record<string, unknown> | null } | null; error: unknown;
      }> } };
    };
    const event = await events.select("event_type,source_event_key,metadata").eq("id", payload.eventId).maybeSingle();
    if (event.error) throw new Error("Verifica compenso non disponibile.");
    if (!event.data) throw new AdminApiError(404, "Compenso non trovato.");
    const isBooking = event.data.event_type === "marketplace_booking_call" ||
      (event.data.event_type === "refund_adjustment" && event.data.source_event_key.startsWith("marketplace_booking_call_refund:"));
    if (isBooking) {
      const bookingId = z.string().uuid().safeParse(event.data.metadata?.booking_call_id);
      if (!bookingId.success) throw new AdminApiError(409, "Riferimento booking non valido.");
      const bookings = supabase.from("marketplace_booking_calls" as never) as unknown as {
        select: (fields: string) => { eq: (key: string, value: string) => { maybeSingle: () => PromiseLike<{
          data: { compensation_event_id: string | null; reversal_event_id: string | null } | null; error: unknown;
        }> } };
      };
      const booking = await bookings.select("compensation_event_id,reversal_event_id").eq("id", bookingId.data).maybeSingle();
      if (booking.error || !booking.data || ![booking.data.compensation_event_id, booking.data.reversal_event_id].includes(payload.eventId)) {
        throw new AdminApiError(409, "Il compenso non corrisponde al booking.");
      }
      const assigned = await rpc.rpc("attribute_booking_call_compensation", {
        p_booking_call_id: bookingId.data, p_member_id: payload.memberId, p_actor_profile_id: profile.id,
      });
      if (assigned.error || !assigned.data) throw new AdminApiError(409, "Compenso booking non attribuito. Ricarica i compensi e riprova.");
      return NextResponse.json({ ok: true, event: assigned.data });
    }
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

