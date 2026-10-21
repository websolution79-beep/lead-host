export type PromotionMember = {
  memberId: string;
  name: string;
  badgeColor: string | null;
};

export type MarketplaceLeadPromotion = {
  leadId: string;
  revision: string;
  state: "assigned" | "released" | "converted" | null;
  promoter: PromotionMember | null;
  availableAt: string | null;
  eligible: boolean;
};

export type MarketplacePromotionsSnapshot = {
  storageReady: boolean;
  engineReady: boolean;
  enabled: boolean;
  canManageAll: boolean;
  serverNow: string;
  candidates: PromotionMember[];
  promotions: MarketplaceLeadPromotion[];
};
