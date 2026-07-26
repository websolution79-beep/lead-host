import { NextResponse, type NextRequest } from "next/server";
import { processBrevoOutbox } from "@/lib/brevo/worker";
import { getEnv } from "@/lib/env";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const cronSecret = getEnv("CRON_SECRET");

  if (
    cronSecret &&
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceSupabaseClient();
    const rpc = supabase as unknown as {
      rpc: (
        fn: "queue_brevo_reconciliation",
      ) => Promise<{ data: number | null; error: { message?: string } | null }>;
    };
    const { data: queuedProfiles, error } = await rpc.rpc(
      "queue_brevo_reconciliation",
    );

    if (error) {
      throw new Error(error.message ?? "Riconciliazione Brevo non accodata.");
    }

    const result = await processBrevoOutbox(100);

    return NextResponse.json({
      ok: true,
      reconciledProfiles: queuedProfiles ?? 0,
      worker: result,
    });
  } catch (error) {
    console.error(
      "Brevo reconciliation failed:",
      error instanceof Error ? error.message : "Errore sconosciuto.",
    );
    return NextResponse.json(
      { error: "Riconciliazione Brevo non completata." },
      { status: 500 },
    );
  }
}
