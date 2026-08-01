export type AddonProductStatus = "draft" | "active" | "inactive";
export type AddonCancellationMode = "period_end" | "immediate";

export type AddonProductAdmin = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  status: AddonProductStatus;
  isMenuVisible: boolean;
  checkoutEnabled: boolean;
  trialDays: number;
  listPriceCents: number | null;
  salePriceCents: number | null;
  currency: string;
  billingInterval: "month" | "year";
  billingIntervalCount: number;
  gracePeriodDays: number;
  cancellationMode: AddonCancellationMode;
  stripeProductId: string;
  stripePriceId: string;
  coverImageUrl: string;
  videoUrl: string;
  features: string[];
  termsUrl: string;
  updatedAt: string;
};

export type AddonSubscriptionSummary = {
  trialing: number;
  active: number;
  paymentIssues: number;
  manual: number;
};
