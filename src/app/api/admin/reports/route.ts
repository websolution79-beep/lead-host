import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  adminApiErrorResponse,
  requireSuperAdmin,
} from "@/lib/admin/auth";
import { sendSupportReplyEmail } from "@/lib/email/notifications";
import { createSupportReplyInternalNotification } from "@/lib/notifications/internal";
import { getSupportSubjectLabel } from "@/lib/support/reports";
import type { Database } from "@/lib/supabase/database.types";
import { buildPagination, readPagination } from "@/lib/api/pagination";

const updateReportSchema = z.object({
  reportId: z.string().uuid(),
  status: z.enum(["pending", "reviewing", "resolved", "rejected"]).optional(),
  reply: z.string().trim().min(1).max(2000).optional(),
}).refine((payload) => payload.status || payload.reply, {
  message: "Indica uno stato o una risposta.",
});

type ReportRow = {
  id: string;
  lead_purchase_id: string | null;
  property_manager_id: string;
  subject: string;
  reason: string | null;
  details: string | null;
  admin_reply: string | null;
  replied_at: string | null;
  replied_by: string | null;
  status: "pending" | "reviewing" | "resolved" | "rejected";
  created_at: string;
  reviewed_at: string | null;
};

type SupportMessageRow = {
  id: string;
  report_id: string;
  sender_type: "pm" | "admin";
  sender_profile_id: string;
  body: string;
  created_at: string;
};

type PurchaseRow = {
  id: string;
  lead_id: string;
  mode: "shared" | "exclusive";
  amount_cents: number;
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const pagination = readPagination(request.nextUrl.searchParams);

    const [
      { data: reports, error: reportsError, count: reportsCount },
      pendingCountResult,
      reviewingCountResult,
      resolvedCountResult,
      rejectedCountResult,
    ] = await Promise.all([
      supabase
        .from("reports")
        .select(
          "id,lead_purchase_id,property_manager_id,subject,reason,details,admin_reply,replied_at,replied_by,status,created_at,reviewed_at",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range(pagination.from, pagination.to),
      countReportsByStatus(supabase, "pending"),
      countReportsByStatus(supabase, "reviewing"),
      countReportsByStatus(supabase, "resolved"),
      countReportsByStatus(supabase, "rejected"),
    ]);

    if (reportsError) throw reportsError;

    const reportRows = (reports ?? []) as ReportRow[];
    const reportIds = reportRows.map((report) => report.id);
    const { data: messages, error: messagesError } = reportIds.length
      ? await supabase
          .from("support_messages")
          .select("id,report_id,sender_type,sender_profile_id,body,created_at")
          .in("report_id", reportIds)
          .order("created_at", { ascending: true })
      : { data: [], error: null };

    if (messagesError) throw messagesError;

    const messagesByReportId = new Map<string, SupportMessageRow[]>();
    for (const message of (messages ?? []) as SupportMessageRow[]) {
      const current = messagesByReportId.get(message.report_id) ?? [];
      current.push(message);
      messagesByReportId.set(message.report_id, current);
    }

    const purchaseIds = Array.from(
      new Set(reportRows.map((item) => item.lead_purchase_id)),
    ).filter((id): id is string => Boolean(id));
    const propertyManagerIds = Array.from(
      new Set(reportRows.map((item) => item.property_manager_id)),
    );

    const [{ data: purchases, error: purchasesError }, { data: managers, error: managersError }] =
      await Promise.all([
        purchaseIds.length
          ? supabase
              .from("lead_purchases")
              .select("id,lead_id,mode,amount_cents,created_at")
              .in("id", purchaseIds)
          : Promise.resolve({ data: [], error: null }),
        propertyManagerIds.length
          ? supabase
              .from("property_manager_profiles")
              .select("id,profile_id,company_name")
              .in("id", propertyManagerIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

    if (purchasesError) throw purchasesError;
    if (managersError) throw managersError;

    const purchaseRows = (purchases ?? []) as PurchaseRow[];
    const leadIds = Array.from(new Set(purchaseRows.map((item) => item.lead_id)));
    const profileIds = Array.from(
      new Set((managers ?? []).map((item) => item.profile_id)),
    );

    const [{ data: leads, error: leadsError }, { data: profiles, error: profilesError }] =
      await Promise.all([
        leadIds.length
          ? supabase.from("leads").select("id,title").in("id", leadIds)
          : Promise.resolve({ data: [], error: null }),
        profileIds.length
          ? supabase
              .from("profiles")
              .select("id,email,first_name,last_name")
              .in("id", profileIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

    if (leadsError) throw leadsError;
    if (profilesError) throw profilesError;

    const purchaseById = new Map(purchaseRows.map((item) => [item.id, item]));
    const leadTitleById = new Map(
      (leads ?? []).map((item) => [item.id, item.title]),
    );
    const managerById = new Map((managers ?? []).map((item) => [item.id, item]));
    const profileById = new Map((profiles ?? []).map((item) => [item.id, item]));

    return NextResponse.json({
      pagination: buildPagination(
        pagination.page,
        pagination.pageSize,
        reportsCount ?? 0,
      ),
      stats: {
        pending: pendingCountResult,
        reviewing: reviewingCountResult,
        resolved: resolvedCountResult,
        rejected: rejectedCountResult,
      },
      reports: reportRows.map((report) => {
        const purchase = report.lead_purchase_id
          ? purchaseById.get(report.lead_purchase_id)
          : undefined;
        const manager = managerById.get(report.property_manager_id);
        const profile = manager ? profileById.get(manager.profile_id) : null;

        return {
          id: report.id,
          subject: report.subject,
          reason: report.reason,
          details: report.details,
          adminReply: report.admin_reply,
          repliedAt: report.replied_at,
          messages: (messagesByReportId.get(report.id) ?? []).map((message) => ({
            id: message.id,
            senderType: message.sender_type,
            body: message.body,
            createdAt: message.created_at,
          })),
          status: report.status,
          createdAt: report.created_at,
          reviewedAt: report.reviewed_at,
          leadTitle: purchase
            ? leadTitleById.get(purchase.lead_id) ?? "Lead acquistato"
            : null,
          purchaseMode: purchase?.mode ?? null,
          purchaseAmountCents: purchase?.amount_cents ?? null,
          propertyManagerName:
            [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
            manager?.company_name ||
            profile?.email ||
            "Property Manager",
          propertyManagerEmail: profile?.email ?? null,
        };
      }),
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

async function countReportsByStatus(
  supabase: Awaited<ReturnType<typeof requireSuperAdmin>>["supabase"],
  status: ReportRow["status"],
) {
  const { count, error } = await supabase
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("status", status);

  if (error) throw error;

  return count ?? 0;
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile } = await requireSuperAdmin(request);
    const payload = updateReportSchema.parse(await request.json());
    const { data: report, error: reportError } = await supabase
      .from("reports")
      .select("id,property_manager_id,lead_purchase_id,subject,admin_reply")
      .eq("id", payload.reportId)
      .maybeSingle();

    if (reportError) throw reportError;
    if (!report) {
      return NextResponse.json({ error: "Richiesta non trovata." }, { status: 404 });
    }

    const reviewedAt = payload.status
      ? payload.status === "resolved" || payload.status === "rejected"
        ? new Date().toISOString()
        : null
      : undefined;
    const updatePayload: Database["public"]["Tables"]["reports"]["Update"] = {};

    if (payload.status) {
      updatePayload.status = payload.status;
      updatePayload.reviewed_at = reviewedAt;
    }

    if (payload.reply) {
      updatePayload.admin_reply = payload.reply;
      updatePayload.replied_at = new Date().toISOString();
      updatePayload.replied_by = profile.id;
    }

    const { error } = await supabase
      .from("reports")
      .update(updatePayload)
      .eq("id", payload.reportId);

    if (error) throw error;

    if (payload.reply) {
      const { error: messageError } = await supabase
        .from("support_messages")
        .insert({
          report_id: report.id,
          sender_type: "admin",
          sender_profile_id: profile.id,
          body: payload.reply,
        });

      if (messageError) throw messageError;

      const { data: manager, error: managerError } = await supabase
        .from("property_manager_profiles")
        .select("id,profile_id")
        .eq("id", report.property_manager_id)
        .single();

      if (managerError) throw managerError;

      const { data: recipient, error: recipientError } = await supabase
        .from("profiles")
        .select("id,email")
        .eq("id", manager.profile_id)
        .single();

      if (recipientError) throw recipientError;

      let leadContext = "";
      if (report.lead_purchase_id) {
        const { data: purchase, error: purchaseError } = await supabase
          .from("lead_purchases")
          .select("lead_id")
          .eq("id", report.lead_purchase_id)
          .maybeSingle();

        if (purchaseError) throw purchaseError;

        if (purchase) {
          const { data: lead, error: leadError } = await supabase
            .from("leads")
            .select("title")
            .eq("id", purchase.lead_id)
            .maybeSingle();

          if (leadError) throw leadError;
          leadContext = lead ? `Lead acquistato: ${lead.title}.` : "";
        }
      }

      await createSupportReplyInternalNotification({
        profileId: recipient.id,
        propertyManagerId: manager.id,
        reportId: report.id,
      });
      await sendSupportReplyEmail({
        profile: recipient,
        reportId: report.id,
        requestSubject: getSupportSubjectLabel(report.subject),
        reply: payload.reply,
        leadContext,
      });
    }

    return NextResponse.json({ ok: true, replySent: Boolean(payload.reply) });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
