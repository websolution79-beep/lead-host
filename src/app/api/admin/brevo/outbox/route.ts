import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import { processBrevoOutbox } from "@/lib/brevo/worker";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("process"),
    batchSize: z.number().int().min(1).max(100).optional(),
  }),
  z.object({
    action: z.literal("reconcile"),
  }),
  z.object({
    action: z.literal("requeue"),
    ids: z.array(z.string().uuid()).min(1).max(100),
  }),
]);

type OutboxRow = {
  id: string;
  profile_id: string;
  event_type: string;
  event_key: string;
  status: string;
  attempts: number;
  available_at: string;
  last_error: string | null;
  last_http_status: number | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const table = supabase.from("brevo_outbox" as never) as unknown as {
      select: (
        columns: string,
        options?: { count?: "exact" },
      ) => {
        in: (column: string, values: string[]) => {
          order: (
            column: string,
            options: { ascending: boolean },
          ) => {
            limit: (count: number) => Promise<{
              data: OutboxRow[] | null;
              count: number | null;
              error: { message?: string } | null;
            }>;
          };
        };
      };
    };
    const { data, count, error } = await table
      .select(
        "id,profile_id,event_type,event_key,status,attempts,available_at,last_error,last_http_status,processed_at,created_at,updated_at",
        { count: "exact" },
      )
      .in("status", ["pending", "retry", "processing", "dead_letter"])
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    return NextResponse.json({
      pendingItems: data ?? [],
      openCount: count ?? 0,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const payload = actionSchema.parse(await request.json());

    if (payload.action === "process") {
      return NextResponse.json({
        ok: true,
        worker: await processBrevoOutbox(payload.batchSize ?? 50),
      });
    }

    if (payload.action === "reconcile") {
      const rpc = supabase as unknown as {
        rpc: (
          fn: "queue_brevo_reconciliation",
        ) => Promise<{
          data: number | null;
          error: { message?: string } | null;
        }>;
      };
      const { data, error } = await rpc.rpc("queue_brevo_reconciliation");
      if (error) throw error;

      return NextResponse.json({
        ok: true,
        queuedProfiles: data ?? 0,
        worker: await processBrevoOutbox(100),
      });
    }

    const table = supabase.from("brevo_outbox" as never) as unknown as {
      update: (values: Record<string, unknown>) => {
        in: (
          column: string,
          values: string[],
        ) => Promise<{ error: { message?: string } | null }>;
      };
    };
    const { error } = await table
      .update({
        status: "retry",
        attempts: 0,
        available_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
        last_error: null,
        last_http_status: null,
        processed_at: null,
        updated_at: new Date().toISOString(),
      })
      .in("id", payload.ids);

    if (error) throw error;

    return NextResponse.json({ ok: true, requeued: payload.ids.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Azione Brevo non valida." },
        { status: 400 },
      );
    }

    return adminApiErrorResponse(error);
  }
}
