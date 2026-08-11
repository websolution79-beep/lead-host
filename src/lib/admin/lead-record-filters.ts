import type { AdminLeadRecord } from "@/lib/admin/lead-records";

const COMPLETED_PURCHASE_STATUSES = new Set(["paid", "contact_unlocked"]);

export function hasActionableDuplicateWarning(record: AdminLeadRecord) {
  return (
    !["published", "not_publishable"].includes(record.requestStatus) &&
    ["duplicate", "possible_duplicate"].includes(record.duplicateCheck.status)
  );
}

export function hasCompletedLeadPurchase(record: AdminLeadRecord) {
  return record.purchases.some((purchase) =>
    COMPLETED_PURCHASE_STATUSES.has(purchase.status),
  );
}

export function isExpiredAdminLead(record: AdminLeadRecord, now = Date.now()) {
  const lead = record.lead;

  if (!lead) return false;
  if (lead.internalStatus === "withdrawn_after_7_days") return true;
  if (!["available", "one_slot_sold"].includes(lead.internalStatus)) return false;
  if (!lead.expiresAt) return false;

  return new Date(lead.expiresAt).getTime() <= now;
}

export function isVisibleAdminMarketplaceLead(
  record: AdminLeadRecord,
  now = Date.now(),
) {
  const lead = record.lead;
  if (!lead?.publishedAt) return false;

  if (["available", "one_slot_sold"].includes(lead.internalStatus)) {
    return Boolean(lead.expiresAt && new Date(lead.expiresAt).getTime() > now);
  }

  if (lead.internalStatus === "withdrawn_after_7_days") {
    return Boolean(
      lead.visibleUntil && new Date(lead.visibleUntil).getTime() >= now,
    );
  }

  if (["sold_two_pm", "sold_exclusive"].includes(lead.internalStatus)) {
    return Boolean(
      lead.soldVisibleUntil && new Date(lead.soldVisibleUntil).getTime() >= now,
    );
  }

  return false;
}
