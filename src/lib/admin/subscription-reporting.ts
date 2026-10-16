export type ReportingSubscription = {
  id: string;
  profile_id: string;
  addon_product_id: string;
  status: string;
  source: string;
  stripe_subscription_id: string | null;
  cancel_at_period_end: boolean;
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
  access_expires_at: string | null;
  updated_at: string;
};

type PrimeAccount = {
  addon_subscription_id: string | null;
  access_source: string;
  prime_started_at: string | null;
};

export function selectReportableSubscriptions<T extends ReportingSubscription>(
  subscriptions: T[], products: Array<{ id: string; slug: string }>, accounts: PrimeAccount[],
) {
  const productsById = new Map(products.map((product) => [product.id, product.slug]));
  const activatedPrimeIds = new Set(accounts.filter((account) =>
    account.access_source !== "none" && account.prime_started_at,
  ).map((account) => account.addon_subscription_id));
  const seen = new Set<string>();
  return [...subscriptions]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id.localeCompare(a.id))
    .filter((row) => {
      const slug = productsById.get(row.addon_product_id);
      if (!slug || ["incomplete", "incomplete_expired"].includes(row.status)) return false;
      if (row.source === "stripe" && !row.stripe_subscription_id) return false;
      // A newer abandoned checkout must not hide the activated PRIME subscription.
      if (slug === "lead-host-prime" && !activatedPrimeIds.has(row.id)) return false;
      const key = `${row.profile_id}:${row.addon_product_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function subscriptionLifecycle(row: Pick<ReportingSubscription,
  "status" | "source" | "trial_ends_at" | "current_period_ends_at" | "access_expires_at"
>, now = Date.now()): "active" | "trialing" | "past_due" | "canceled" {
  if (["past_due", "unpaid"].includes(row.status)) return "past_due";
  const end = row.status === "trialing" ? row.trial_ends_at
    : row.source === "manual" ? row.access_expires_at : row.current_period_ends_at;
  if (end && (!Number.isFinite(Date.parse(end)) || Date.parse(end) <= now)) return "canceled";
  if (row.status === "trialing") return end ? "trialing" : "canceled";
  return row.status === "active" ? "active" : "canceled";
}

export function summarizeSubscriptions(rows: ReportingSubscription[], now = Date.now()) {
  const result = { total: rows.length, active: 0, trialing: 0, pastDue: 0, cancelAtPeriodEnd: 0, cancelled: 0 };
  for (const row of rows) {
    const state = subscriptionLifecycle(row, now);
    if (state === "active") result.active += 1;
    else if (state === "trialing") result.trialing += 1;
    else if (state === "past_due") result.pastDue += 1;
    else result.cancelled += 1;
    // Scheduled cancellation is a subset, not an alternative to active/trialing.
    if (state !== "canceled" && row.cancel_at_period_end) result.cancelAtPeriodEnd += 1;
  }
  return result;
}
