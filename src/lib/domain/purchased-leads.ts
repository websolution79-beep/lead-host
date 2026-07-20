import { demoLeads } from "@/lib/domain/sample-data";
import type { PurchaseMode } from "@/lib/domain/lead-state";

export type PurchasedLead = {
  leadId: string;
  purchaseMode: PurchaseMode;
  purchasedAt: string;
  unlockedAt: string;
  ownerContact: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
  };
};

export const demoPurchasedLeads: PurchasedLead[] = [
  {
    leadId: "palermo-centro-trilocale",
    purchaseMode: "shared",
    purchasedAt: "2026-07-20T10:18:00.000Z",
    unlockedAt: "2026-07-20T10:19:00.000Z",
    ownerContact: {
      firstName: "Giulia",
      lastName: "Ferrara",
      phone: "+39 333 123 4567",
      email: "giulia.ferrara@example.com",
    },
  },
  {
    leadId: "roma-prati-bilocale",
    purchaseMode: "exclusive",
    purchasedAt: "2026-07-19T15:42:00.000Z",
    unlockedAt: "2026-07-19T15:43:00.000Z",
    ownerContact: {
      firstName: "Marco",
      lastName: "De Santis",
      phone: "+39 347 987 6543",
      email: "marco.desantis@example.com",
    },
  },
];

export function getPurchasedLead(leadId: string) {
  const purchase = demoPurchasedLeads.find((item) => item.leadId === leadId);
  const lead = demoLeads.find((item) => item.id === leadId);

  if (!purchase || !lead) {
    return null;
  }

  return {
    ...purchase,
    lead,
  };
}

export function getPurchasedLeadList() {
  return demoPurchasedLeads
    .map((purchase) => {
      const lead = demoLeads.find((item) => item.id === purchase.leadId);

      if (!lead) {
        return null;
      }

      return {
        ...purchase,
        lead,
      };
    })
    .filter((item) => item !== null);
}
