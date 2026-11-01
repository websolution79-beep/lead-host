import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { AdminLeadRecord } from "@/lib/admin/lead-records";
import { fetchPurchasesByLead } from "@/lib/admin/lead-records";
import { getVisibleSharedSlotsAvailable, parseLeadDate } from "@/lib/domain/lead-state";

export type AdminLeadListRecord = Pick<AdminLeadRecord, "ownerRequestId" | "createdAt" | "requestStatus" | "ownerVerified"> & {
  summaryOnly: true;
  duplicateCheck: Pick<AdminLeadRecord["duplicateCheck"], "status">;
  contact: Pick<NonNullable<AdminLeadRecord["contact"]>, "firstName" | "lastName" | "email"> | null;
  property: Pick<NonNullable<AdminLeadRecord["property"]>, "propertyType" | "city" | "province" | "region"> | null;
  lead: Pick<NonNullable<AdminLeadRecord["lead"]>, "id" | "title" | "internalStatus" | "visibilityMode" | "publishedAt" | "expiresAt" | "visibleUntil" | "soldVisibleUntil" | "exclusivePurchaseId" | "sharedSlotsAvailable"> | null;
  purchases: Pick<AdminLeadRecord["purchases"][number], "buyerCompany" | "buyerName" | "status">[];
};

export async function fetchAdminLeadListRecords(db: SupabaseClient<Database>, ids: string[]): Promise<AdminLeadListRecord[]> {
  if (!ids.length) return [];
  const [requests, contacts, properties, leads] = await Promise.all([
    db.from("owner_requests").select("id,created_at,status,owner_verified,duplicate_check").in("id", ids),
    db.from("owner_contacts").select("owner_request_id,first_name,last_name,email").in("owner_request_id", ids),
    db.from("properties").select("owner_request_id,property_type,city,province,region").in("owner_request_id", ids),
    db.from("leads").select("id,owner_request_id,title,internal_status,visibility_mode,published_at,expires_at,visible_until,sold_visible_until,exclusive_purchase_id,shared_slots_sold").in("owner_request_id", ids),
  ]);
  for (const result of [requests, contacts, properties, leads]) if (result.error) throw result.error;
  const contactsById = new Map(contacts.data?.map((r) => [r.owner_request_id, r]));
  const propertiesById = new Map(properties.data?.map((r) => [r.owner_request_id, r]));
  const leadsById = new Map(leads.data?.map((r) => [r.owner_request_id, r]));
  const requestsById = new Map(requests.data?.map((r) => [r.id, r]));
  const purchases = await fetchPurchasesByLead(db, leads.data?.map((r) => r.id) ?? []);
  return ids.flatMap((id) => {
    const r = requestsById.get(id);
    if (!r) return [];
    const c = contactsById.get(id), p = propertiesById.get(id), l = leadsById.get(id);
    const duplicate = r.duplicate_check && typeof r.duplicate_check === "object" && !Array.isArray(r.duplicate_check) ? r.duplicate_check.status : null;
    return [{
      summaryOnly: true as const, ownerRequestId: r.id, createdAt: r.created_at, requestStatus: r.status, ownerVerified: r.owner_verified,
      duplicateCheck: { status: typeof duplicate === "string" ? duplicate : "unchecked" },
      contact: c ? { firstName: c.first_name, lastName: c.last_name, email: c.email } : null,
      property: p ? { propertyType: p.property_type, city: p.city, province: p.province, region: p.region } : null,
      lead: l ? { id: l.id, title: l.title, internalStatus: l.internal_status, visibilityMode: l.visibility_mode,
        publishedAt: l.published_at, expiresAt: l.expires_at, visibleUntil: l.visible_until, soldVisibleUntil: l.sold_visible_until,
        exclusivePurchaseId: l.exclusive_purchase_id, sharedSlotsAvailable: getVisibleSharedSlotsAvailable({
          internalStatus: l.internal_status, sharedSlotsSold: l.shared_slots_sold, exclusivePurchaseId: l.exclusive_purchase_id,
          expiresAt: parseLeadDate(l.expires_at ?? l.visible_until ?? new Date(0).toISOString()),
        }) } : null,
      purchases: (l ? purchases.get(l.id) ?? [] : []).map(({ buyerCompany, buyerName, status }) => ({ buyerCompany, buyerName, status })),
    }];
  });
}
