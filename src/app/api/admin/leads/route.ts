import { NextResponse, type NextRequest } from "next/server";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import { fetchAdminLeadRecords } from "@/lib/admin/lead-records";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

type ServiceClient = SupabaseClient<Database>;

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const [records, stats] = await Promise.all([
      fetchAdminLeadRecords(supabase),
      fetchLeadStats(supabase),
    ]);

    return NextResponse.json({
      records,
      stats,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

async function fetchLeadStats(supabase: ServiceClient) {
  const [requestsResult, leadsResult, purchasesResult] = await Promise.all([
    supabase.from("owner_requests").select("status,duplicate_check"),
    supabase
      .from("leads")
      .select(
        "id,internal_status,published_at,expires_at,visible_until,sold_visible_until,visibility_mode,prime_access_until",
      ),
    supabase
      .from("lead_purchases")
      .select("lead_id,status")
      .in("status", ["paid", "contact_unlocked"]),
  ]);

  if (requestsResult.error) throw requestsResult.error;
  if (leadsResult.error) throw leadsResult.error;
  if (purchasesResult.error) throw purchasesResult.error;

  const requests = requestsResult.data ?? [];
  const leads = leadsResult.data ?? [];
  const now = Date.now();
  const purchasedLeadIds = new Set(
    (purchasesResult.data ?? []).map((purchase) => purchase.lead_id),
  );

  return {
    waitingCompletion: requests.filter(
      (item) => item.status === "waiting_for_completion",
    ).length,
    duplicates: requests.filter((item) =>
      isActionableDuplicate(item.status, item.duplicate_check),
    ).length,
    newLeads: requests.filter((item) => item.status === "to_verify").length,
    pending: requests.filter((item) => item.status === "pending").length,
    prime: leads.filter((lead) => isActivePrimeLead(lead, now)).length,
    published: leads.filter((lead) => isVisibleMarketplaceLead(lead, now)).length,
    sold: purchasedLeadIds.size,
    expired: leads.filter((lead) => isExpiredLead(lead, now)).length,
    rejected: requests.filter((item) => item.status === "not_publishable").length,
  };
}

function isActivePrimeLead(
  lead: {
    visibility_mode: string;
    prime_access_until: string | null;
    internal_status: string;
  },
  now: number,
) {
  return (
    lead.visibility_mode === "prime_private" &&
    lead.internal_status === "available" &&
    Boolean(
      lead.prime_access_until &&
        new Date(lead.prime_access_until).getTime() > now,
    )
  );
}

function isActionableDuplicate(status: string, duplicateCheck: Json) {
  if (["published", "not_publishable"].includes(status)) return false;
  if (!duplicateCheck || typeof duplicateCheck !== "object" || Array.isArray(duplicateCheck)) {
    return false;
  }

  const duplicateStatus = (duplicateCheck as Record<string, Json | undefined>).status;
  return duplicateStatus === "duplicate" || duplicateStatus === "possible_duplicate";
}

function isVisibleMarketplaceLead(
  lead: {
    internal_status: string;
    published_at: string | null;
    expires_at: string | null;
    visible_until: string | null;
    sold_visible_until: string | null;
  },
  now: number,
) {
  if (!lead.published_at) return false;

  if (["available", "one_slot_sold"].includes(lead.internal_status)) {
    return Boolean(lead.expires_at && new Date(lead.expires_at).getTime() > now);
  }

  if (lead.internal_status === "withdrawn_after_7_days") {
    return Boolean(
      lead.visible_until && new Date(lead.visible_until).getTime() >= now,
    );
  }

  if (["sold_two_pm", "sold_exclusive"].includes(lead.internal_status)) {
    return Boolean(
      lead.sold_visible_until &&
        new Date(lead.sold_visible_until).getTime() >= now,
    );
  }

  return false;
}

function isExpiredLead(
  lead: {
    internal_status: string;
    expires_at: string | null;
  },
  now: number,
) {
  if (lead.internal_status === "withdrawn_after_7_days") return true;
  if (!["available", "one_slot_sold"].includes(lead.internal_status)) return false;
  if (!lead.expires_at) return false;

  return new Date(lead.expires_at).getTime() <= now;
}
