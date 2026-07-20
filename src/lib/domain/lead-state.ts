export const LEAD_SHARED_PRICE_CENTS = 2900;
export const LEAD_EXCLUSIVE_PRICE_CENTS = 5000;
export const LEAD_MAX_SHARED_BUYERS = 2;
export const LEAD_AVAILABILITY_DAYS = 7;

export type LeadPublicStatus =
  | "available"
  | "last_availability"
  | "unavailable";

export type LeadInternalStatus =
  | "available"
  | "one_slot_sold"
  | "sold_two_pm"
  | "sold_exclusive"
  | "withdrawn_after_7_days"
  | "cancelled"
  | "refunded";

export type PurchaseMode = "shared" | "exclusive";

export type PurchaseStatus =
  | "initiated"
  | "reserved"
  | "checkout_created"
  | "payment_pending"
  | "paid"
  | "contact_unlocked"
  | "failed"
  | "expired"
  | "cancelled"
  | "refunded";

export function formatPublicStatus(status: LeadPublicStatus) {
  const labels: Record<LeadPublicStatus, string> = {
    available: "Disponibile",
    last_availability: "Ultima disponibilita",
    unavailable: "Non piu disponibile",
  };

  return labels[status];
}

export function canPurchaseLead(input: {
  internalStatus: LeadInternalStatus;
  sharedSlotsSold: number;
  exclusivePurchaseId?: string | null;
  mode: PurchaseMode;
  expiresAt: Date;
  now?: Date;
}) {
  const now = input.now ?? new Date();

  if (input.expiresAt <= now) {
    return false;
  }

  if (input.internalStatus === "sold_exclusive" || input.exclusivePurchaseId) {
    return false;
  }

  if (input.mode === "exclusive") {
    return input.internalStatus === "available" && input.sharedSlotsSold === 0;
  }

  return input.sharedSlotsSold < LEAD_MAX_SHARED_BUYERS;
}

export function getSharedSlotsAvailable(sharedSlotsSold: number) {
  return Math.max(LEAD_MAX_SHARED_BUYERS - sharedSlotsSold, 0);
}

export function isExclusiveAvailable(input: {
  internalStatus: LeadInternalStatus;
  sharedSlotsSold: number;
  exclusivePurchaseId?: string | null;
  expiresAt: Date;
  now?: Date;
}) {
  return canPurchaseLead({
    ...input,
    mode: "exclusive",
  });
}

export function isSharedAvailable(input: {
  internalStatus: LeadInternalStatus;
  sharedSlotsSold: number;
  exclusivePurchaseId?: string | null;
  expiresAt: Date;
  now?: Date;
}) {
  return canPurchaseLead({
    ...input,
    mode: "shared",
  });
}

export function parseLeadDate(value: string) {
  return value.includes("T") ? new Date(value) : new Date(`${value}T23:59:59`);
}
