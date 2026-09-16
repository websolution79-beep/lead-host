import { z } from "zod";

export const marketplaceMembershipSettingsSchema = z.object({
  paidAccessEnabled: z.boolean(),
  listPriceCents: z.number().int().min(1).max(1_000_000).nullable(),
  promoEnabled: z.boolean(),
  promoPriceCents: z.number().int().min(1).max(1_000_000).nullable(),
  trialDays: z.number().int().min(0).max(365),
}).superRefine((value, context) => {
  if (value.promoEnabled && (
    value.promoPriceCents === null || value.listPriceCents === null ||
    value.promoPriceCents > value.listPriceCents
  )) {
    context.addIssue({ code: "custom", path: ["promoPriceCents"],
      message: "La promozione richiede un prezzo non superiore al listino." });
  }
  if (value.paidAccessEnabled && value.listPriceCents === null) {
    context.addIssue({ code: "custom", path: ["listPriceCents"],
      message: "Imposta il prezzo mensile prima di attivare l'accesso a pagamento." });
  }
});

export type MarketplaceMembershipSettings = z.infer<typeof marketplaceMembershipSettingsSchema>;

export function marketplaceMonthlyPrice(settings: MarketplaceMembershipSettings) {
  return settings.promoEnabled ? settings.promoPriceCents : settings.listPriceCents;
}

type SubscriptionAccess = {
  status: string;
  trialEndsAt: string | null;
  periodEndsAt: string | null;
};

// Pure policy, wired into routes only after the billing rollout is complete.
export function resolveMarketplaceMembershipAccess({
  paidAccessEnabled, hasPrimeAccess, subscription, now = Date.now(),
}: {
  paidAccessEnabled: boolean;
  hasPrimeAccess: boolean;
  subscription: SubscriptionAccess | null;
  now?: number;
}): "open" | "prime" | "subscription" | "required" {
  if (!paidAccessEnabled) return "open";
  if (hasPrimeAccess) return "prime";
  if (!subscription) return "required";
  const end = subscription.status === "trialing"
    ? subscription.trialEndsAt : subscription.periodEndsAt;
  if ((subscription.status === "active" || subscription.status === "trialing") &&
      end && new Date(end).getTime() > now) return "subscription";
  return "required";
}
