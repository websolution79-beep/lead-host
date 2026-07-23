import { NextResponse, type NextRequest } from "next/server";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";

type ReportSummaryRow = {
  id: string;
  status: "pending" | "reviewing" | "resolved" | "rejected";
  admin_reply: string | null;
};

type MessageSummaryRow = {
  report_id: string;
  sender_type: "pm" | "admin";
};

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const { data: reports, error: reportsError } = await supabase
      .from("reports")
      .select("id,status,admin_reply")
      .in("status", ["pending", "reviewing"]);

    if (reportsError) throw reportsError;

    const reportRows = (reports ?? []) as ReportSummaryRow[];
    const reportIds = reportRows.map((report) => report.id);
    const { data: messages, error: messagesError } = reportIds.length
      ? await supabase
          .from("support_messages")
          .select("report_id,sender_type")
          .in("report_id", reportIds)
          .order("created_at", { ascending: true })
      : { data: [], error: null };

    if (messagesError) throw messagesError;

    const lastSenderByReport = new Map<string, "pm" | "admin">();
    for (const message of (messages ?? []) as MessageSummaryRow[]) {
      lastSenderByReport.set(message.report_id, message.sender_type);
    }

    const count = reportRows.filter((report) => {
      const lastSender = lastSenderByReport.get(report.id);
      return lastSender === "pm" || (!lastSender && !report.admin_reply);
    }).length;

    return NextResponse.json({ count });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
