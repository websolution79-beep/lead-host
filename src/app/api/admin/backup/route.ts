import { NextResponse, type NextRequest } from "next/server";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";

export async function GET(request: NextRequest) {
  try {
    const { supabase, isSuperAdmin } = await requireSuperAdmin(request);
    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: "Ruolo Super Admin richiesto." },
        { status: 403 },
      );
    }

    const { data, error } = await supabase
      .from("backup_component_status")
      .select(
        "component,status,last_attempt_at,last_success_at,run_id,run_url,metadata,updated_at",
      )
      .order("component");

    if (error) {
      const storageReady = error.code !== "42P01" && error.code !== "PGRST205";
      return NextResponse.json(
        {
          storageReady,
          components: [],
          error: storageReady
            ? "Non riesco a leggere lo stato dei backup."
            : undefined,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    return NextResponse.json(
      { storageReady: true, components: data ?? [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

