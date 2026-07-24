import { NextResponse, type NextRequest } from "next/server";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const { count, error } = await supabase
      .from("owner_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "to_verify"]);

    if (error) throw error;

    return NextResponse.json({ count: count ?? 0 });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
