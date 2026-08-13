import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedProfileContext } from "@/lib/auth/profile-context";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ leadId: string }>;
};

type LeadViewRpcClient = {
  rpc: (
    fn: "record_marketplace_lead_view",
    args: { p_lead_id: string },
  ) => Promise<{
    data: number | null;
    error: { code?: string; message?: string } | null;
  }>;
};

export async function POST(request: NextRequest, { params }: RouteContext) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return NextResponse.json({ error: "Sessione non trovata." }, { status: 401 });
  }

  const context = await getAuthenticatedProfileContext(token);

  if (!context || context.profile.status !== "active") {
    return NextResponse.json({ error: "Sessione non valida." }, { status: 401 });
  }

  const { leadId } = await params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(leadId)) {
    return NextResponse.json({ error: "Lead non valido." }, { status: 422 });
  }

  const supabase = createServiceSupabaseClient() as unknown as LeadViewRpcClient;
  const { data, error } = await supabase.rpc("record_marketplace_lead_view", {
    p_lead_id: leadId,
  });

  if (error) {
    if (
      error.code === "PGRST202" ||
      error.code === "42883" ||
      error.message?.includes("record_marketplace_lead_view")
    ) {
      return NextResponse.json(
        { error: "Contatore visualizzazioni non ancora disponibile." },
        { status: 409 },
      );
    }

    if (error.message?.includes("marketplace_lead_not_found")) {
      return NextResponse.json({ error: "Lead non trovato." }, { status: 404 });
    }

    console.error("Marketplace lead view tracking failed:", error);
    return NextResponse.json({ error: "Visualizzazione non registrata." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, viewCount: Number(data ?? 0) });
}
