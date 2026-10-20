import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminApiErrorResponse, requireAdminPermission } from "@/lib/admin/auth";

const headers = { "Cache-Control": "private, no-store" };
const schema = z.object({
  ownerRequestId: z.string().uuid(), sessionId: z.string().uuid(),
  action: z.enum(["heartbeat", "release"]),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile } = await requireAdminPermission(request, "leads", "write");
    const command = schema.safeParse(await request.json().catch(() => null));
    if (!command.success) return NextResponse.json({ error: "Presenza non valida." }, { status: 422, headers });
    const result = await supabase.rpc("update_owner_request_presence", {
      p_owner_request_id: command.data.ownerRequestId, p_session_id: command.data.sessionId,
      p_actor_profile_id: profile.id, p_action: command.data.action,
    });
    if (result.error) {
      if (["42P01", "PGRST202", "PGRST205"].includes(result.error.code)) {
        return NextResponse.json({ error: "Controllo presenze non ancora disponibile." }, { status: 503, headers });
      }
      throw result.error;
    }
    const payload = result.data;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid presence response");
    if (payload.status === "conflict") return NextResponse.json({ error: "Sessione della scheda non valida. Riapri la scheda." }, { status: 409, headers });
    return NextResponse.json(payload, { headers });
  } catch (error) { return adminApiErrorResponse(error); }
}
