export const commercialRules = {
  sharedLeadPriceCents: 2900,
  exclusiveLeadPriceCents: 5000,
  maxSharedBuyers: 2,
  leadAvailabilityDays: 7,
  unavailableVisibilityDays: 7,
  currency: "eur",
} as const;

export function formatCents(amountCents: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}
