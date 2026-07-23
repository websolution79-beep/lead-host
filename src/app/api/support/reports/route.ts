import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  propertyManagerApiErrorResponse,
  requirePropertyManager,
} from "@/lib/api/property-manager-auth";
import { createSupportReportInternalNotification } from "@/lib/notifications/internal";
import { supportSubjectOptions } from "@/lib/support/reports";

const reportSchema = z.object({
  leadPurchaseId: z.string().uuid().optional(),
  subject: z.enum(supportSubjectOptions.map((item) => item.value) as [
    string,
    ...string[],
  ]),
  details: z.string().trim().min(12).max(1200),
}).superRefine((payload, context) => {
  if (payload.subject === "purchased_lead_assistance" && !payload.leadPurchaseId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["leadPurchaseId"],
      message: "Lead acquistato obbligatorio",
    });
  }
});

type PurchaseRow = {
  id: string;
  lead_id: string;
  mode: "shared" | "exclusive";
  amount_cents: number;
  created_at: string;
};

type ReportRow = {
  id: string;
  lead_purchase_id: string | null;
  subject: string;
  reason: string | null;
  details: string | null;
  status: "pending" | "reviewing" | "resolved" | "rejected";
  created_at: string;
  reviewed_at: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const { supabase, propertyManager } = await requirePropertyManager(request);
    const purchases = await fetchPurchases(supabase, propertyManager.id);
    const leadTitlesById = await fetchLeadTitles(
      supabase,
      purchases.map((item) => item.lead_id),
    );

    const { data: reports, error: reportsError } = await supabase
      .from("reports")
      .select("id,lead_purchase_id,subject,reason,details,status,created_at,reviewed_at")
      .eq("property_manager_id", propertyManager.id)
      .order("created_at", { ascending: false });

    if (reportsError) throw reportsError;

    const purchaseById = new Map(purchases.map((item) => [item.id, item]));

    return NextResponse.json({
      purchases: purchases.map((purchase) => ({
        id: purchase.id,
        leadId: purchase.lead_id,
        leadTitle: leadTitlesById.get(purchase.lead_id) ?? "Lead acquistato",
        mode: purchase.mode,
        amountCents: purchase.amount_cents,
        createdAt: purchase.created_at,
      })),
      reports: ((reports ?? []) as ReportRow[]).map((report) => {
        const purchase = report.lead_purchase_id
          ? purchaseById.get(report.lead_purchase_id)
          : undefined;

        return {
          id: report.id,
          leadPurchaseId: report.lead_purchase_id,
          leadTitle: purchase
            ? leadTitlesById.get(purchase.lead_id) ?? "Lead acquistato"
            : null,
          subject: report.subject,
          reason: report.reason,
          details: report.details,
          status: report.status,
          createdAt: report.created_at,
          reviewedAt: report.reviewed_at,
        };
      }),
    });
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile, propertyManager } = await requirePropertyManager(request);
    const payload = reportSchema.parse(await request.json());

    const purchase = payload.leadPurchaseId
      ? await fetchPurchase(supabase, payload.leadPurchaseId, propertyManager.id)
      : null;

    if (payload.subject === "purchased_lead_assistance" && !purchase) {
      return NextResponse.json(
        { error: "Lead acquistato non trovato per questo profilo." },
        { status: 404 },
      );
    }

    const { data: report, error: reportError } = await supabase
      .from("reports")
      .insert({
        lead_purchase_id: purchase?.id ?? null,
        property_manager_id: propertyManager.id,
        subject: payload.subject,
        reason: null,
        details: payload.details,
        status: "pending",
      })
      .select("id,reason,status,created_at")
      .single();

    if (reportError) throw reportError;

    const leadTitlesById = purchase
      ? await fetchLeadTitles(supabase, [purchase.lead_id])
      : new Map<string, string>();

    await createSupportReportInternalNotification({
      profileId: profile.id,
      propertyManagerId: propertyManager.id,
      reportId: report.id,
      subject: payload.subject,
      leadTitle: purchase ? leadTitlesById.get(purchase.lead_id) ?? "Lead acquistato" : null,
    });

    return NextResponse.json({ ok: true, report });
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}

async function fetchPurchase(
  supabase: Awaited<ReturnType<typeof requirePropertyManager>>["supabase"],
  purchaseId: string,
  propertyManagerId: string,
) {
  const { data, error } = await supabase
    .from("lead_purchases")
    .select("id,lead_id,property_manager_id,status")
    .eq("id", purchaseId)
    .eq("property_manager_id", propertyManagerId)
    .in("status", ["paid", "contact_unlocked"])
    .maybeSingle();

  if (error) throw error;

  return data;
}

async function fetchPurchases(
  supabase: Awaited<ReturnType<typeof requirePropertyManager>>["supabase"],
  propertyManagerId: string,
) {
  const { data, error } = await supabase
    .from("lead_purchases")
    .select("id,lead_id,mode,amount_cents,created_at")
    .eq("property_manager_id", propertyManagerId)
    .in("status", ["paid", "contact_unlocked"])
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []) as PurchaseRow[];
}

async function fetchLeadTitles(
  supabase: Awaited<ReturnType<typeof requirePropertyManager>>["supabase"],
  leadIds: string[],
) {
  if (leadIds.length === 0) {
    return new Map<string, string>();
  }

  const { data, error } = await supabase
    .from("leads")
    .select("id,title")
    .in("id", Array.from(new Set(leadIds)));

  if (error) throw error;

  return new Map((data ?? []).map((lead) => [lead.id, lead.title]));
}
