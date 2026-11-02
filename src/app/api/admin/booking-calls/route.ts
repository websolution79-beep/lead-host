import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AdminApiError, adminApiErrorResponse, requireAdminPermission } from "@/lib/admin/auth";
import { bookingCallTaskSchema } from "@/lib/booking-call/contracts";
import { runBookingCallEmailWorkerSafely } from "@/lib/booking-call/email-worker";

type Client = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> };
const patchSchema = z.object({ id: z.string().uuid(), status: z.enum(["to_schedule", "in_progress", "scheduled"]), scheduledAt: z.string().datetime().nullable().optional() });

export async function GET(request: NextRequest) {
  try {
    const { supabase, profile } = await requireAdminPermission(request, "leads", "read");
    const id = request.nextUrl.searchParams.get("id"), leadId = request.nextUrl.searchParams.get("leadId");
    if ((Boolean(id) === Boolean(leadId)) || !z.string().uuid().safeParse(id ?? leadId).success) return NextResponse.json({ error: "Identificativo booking non valido." }, { status: 400 });
    const result = await (supabase as unknown as Client).rpc("get_booking_call_task", { p_actor_profile_id: profile.id, p_booking_call_id: id, p_lead_id: leadId });
    if (result.error && ["PGRST202", "42883"].includes(result.error.code ?? "")) return NextResponse.json({ bookingCall: null, storageReady: false });
    if (result.error) throw new Error("Booking non disponibile.");
    return NextResponse.json({ bookingCall: result.data ? bookingCallTaskSchema.parse(result.data) : null, storageReady: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return adminApiErrorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile } = await requireAdminPermission(request, "leads", "write");
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || (parsed.data.status === "scheduled" && !parsed.data.scheduledAt)) return NextResponse.json({ error: "Seleziona una fase e inserisci data e ora per l'appuntamento fissato." }, { status: 422 });
    const result = await (supabase as unknown as Client).rpc("update_booking_call_task", { p_actor_profile_id: profile.id, p_booking_call_id: parsed.data.id, p_status: parsed.data.status, p_scheduled_at: parsed.data.scheduledAt ?? null });
    if (result.error) throw new AdminApiError(result.error.code === "42501" ? 403 : 409, result.error.message?.includes("refunded") ? "Il booking e stato annullato per riaccredito." : "Non puoi aggiornare questo booking. Ricarica la scheda.");
    return NextResponse.json({ bookingCall: bookingCallTaskSchema.parse(result.data) });
  } catch (error) { return adminApiErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile } = await requireAdminPermission(request, "leads", "write");
    const parsed = z.object({ id: z.string().uuid() }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Booking non valido." }, { status: 422 });
    const result = await (supabase as unknown as Client).rpc("retry_booking_call_email", { p_actor_profile_id: profile.id, p_booking_call_id: parsed.data.id });
    if (result.error) throw new AdminApiError(result.error.code === "42501" ? 403 : 409, "Notifica non riattivabile per questo booking.");
    if (result.data === true) after(() => runBookingCallEmailWorkerSafely(1, parsed.data.id).then(() => undefined));
    return NextResponse.json({ ok: true, queued: result.data === true });
  } catch (error) { return adminApiErrorResponse(error); }
}
