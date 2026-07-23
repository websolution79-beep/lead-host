import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { revalidateTag } from "next/cache";
import { MARKETPLACE_LEADS_CACHE_TAG } from "@/lib/cache/tags";

type ExpireLeadsResult = {
  expired_count: number;
  hidden_count: number;
};

type ExpireLeadsRpcClient = {
  rpc: (
    fn: "expire_leads",
    args?: Record<string, never>,
  ) => {
    single: () => Promise<{
      data: ExpireLeadsResult | null;
      error: { code?: string; message?: string } | null;
    }>;
  };
};

export async function GET(request: NextRequest) {
  const cronSecret = getEnv("CRON_SECRET");
  const authHeader = request.headers.get("authorization");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient() as unknown as ExpireLeadsRpcClient;
  const { data, error } = await supabase.rpc("expire_leads").single();

  if (error || !data) {
    const message = error?.message ?? "Lifecycle lead non eseguito.";

    if (error?.code === "PGRST202" || message.includes("expire_leads")) {
      return NextResponse.json(
        {
          error:
            "Database non aggiornato per lifecycle lead. Applica la migration lead_lifecycle_expiration e riprova.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (data.expired_count > 0 || data.hidden_count > 0) {
    revalidateTag(MARKETPLACE_LEADS_CACHE_TAG, "max");
  }

  return NextResponse.json({
    ok: true,
    expired: data.expired_count,
    hidden: data.hidden_count,
  });
}
