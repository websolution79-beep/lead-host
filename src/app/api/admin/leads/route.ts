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
        waitingCompletion: records.filter(
          (item) => item.requestStatus === "waiting_for_completion",
        ).length,
        pending: records.filter((item) =>
          ["pending", "to_verify"].includes(item.requestStatus),
        ).length,
        published: records.filter((item) => item.requestStatus === "published")
          .length,
        sold: records.filter((item) => item.purchases.length > 0).length,
        expired: records.filter(isExpiredLead).length,
        rejected: records.filter((item) => item.requestStatus === "not_publishable")
          .length,
      },
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

function isExpiredLead(record: Awaited<ReturnType<typeof fetchAdminLeadRecords>>[number]) {
  const lead = record.lead;

  if (!lead) return false;
  if (lead.internalStatus === "withdrawn_after_7_days") return true;
  if (!["available", "one_slot_sold"].includes(lead.internalStatus)) return false;
  if (!lead.expiresAt) return false;

  return new Date(lead.expiresAt).getTime() <= Date.now();
}
