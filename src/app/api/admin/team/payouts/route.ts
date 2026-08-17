import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";

const createSchema = z.object({
  memberId: z.string().uuid(),
  amountCents: z.number().int().positive().max(10_000_000),
  paymentMethod: z.enum(["paypal", "bank_transfer", "cash", "other"]),
  paymentReference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
  paidAt: z.string().datetime(),
});
const voidSchema = z.object({
  payoutId: z.string().uuid(),
  reason: z.string().trim().min(3).max(600),
});

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const rpc = supabase as unknown as {
      rpc: (fn: "get_admin_team_compensation_payouts") => Promise<{
        data: unknown;
        error: { message?: string } | null;
      }>;
    };
    const { data, error } = await rpc.rpc("get_admin_team_compensation_payouts");
    if (error || !data) throw new Error(error?.message ?? "Liquidazioni non disponibili.");
    return NextResponse.json(data);
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile } = await requireSuperAdmin(request);
    const payload = createSchema.parse(await request.json());
    const rpc = supabase as unknown as {
      rpc: (fn: "record_team_compensation_payout", args: Record<string, unknown>) => Promise<{
        data: unknown;
        error: { message?: string; details?: string } | null;
      }>;
    };
    const { data, error } = await rpc.rpc("record_team_compensation_payout", {
      p_member_id: payload.memberId,
      p_amount_cents: payload.amountCents,
      p_payment_method: payload.paymentMethod,
      p_payment_reference: payload.paymentReference ?? "",
      p_notes: payload.notes ?? "",
      p_paid_at: payload.paidAt,
      p_actor_profile_id: profile.id,
    });
    if (error || !data) throw new Error(error?.message ?? "Liquidazione non registrata.");
    return NextResponse.json({ ok: true, payout: data });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile } = await requireSuperAdmin(request);
    const payload = voidSchema.parse(await request.json());
    const rpc = supabase as unknown as {
      rpc: (fn: "void_team_compensation_payout", args: Record<string, unknown>) => Promise<{
        data: unknown;
        error: { message?: string } | null;
      }>;
    };
    const { data, error } = await rpc.rpc("void_team_compensation_payout", {
      p_payout_id: payload.payoutId,
      p_reason: payload.reason,
      p_actor_profile_id: profile.id,
    });
    if (error || !data) throw new Error(error?.message ?? "Liquidazione non annullata.");
    return NextResponse.json({ ok: true, payout: data });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

