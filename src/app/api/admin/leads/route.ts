import { NextResponse, type NextRequest } from "next/server";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import { fetchAdminLeadRecords } from "@/lib/admin/lead-records";

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const records = await fetchAdminLeadRecords(supabase);

    return NextResponse.json({
      records,
      stats: {
        pending: records.filter((item) =>
          ["pending", "to_verify"].includes(item.requestStatus),
        ).length,
        published: records.filter((item) => item.requestStatus === "published")
          .length,
        sold: records.filter((item) => item.purchases.length > 0).length,
        rejected: records.filter((item) => item.requestStatus === "not_publishable")
          .length,
      },
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
