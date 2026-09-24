export type PrimeSubscriberStatusRow = {
  account: {
    status: string;
    access_source?: string;
    prime_started_at?: string | null;
    prime_expires_at: string | null;
    grace_ends_at: string | null;
  } | null;
  subscription: {
    cancel_at_period_end: boolean;
    current_period_ends_at: string | null;
  } | null;
};

export function isPrimeSubscriber(
  account: PrimeSubscriberStatusRow["account"],
) {
  return Boolean(
    account &&
      account.access_source !== "none" &&
      account.prime_started_at,
  );
}

export function matchesPrimeSubscriberStatus(
  row: PrimeSubscriberStatusRow,
  status: string,
  now = Date.now(),
) {
  if (status === "all") return true;
  if (status === "active") {
    return row.account?.status === "active" && !row.subscription?.cancel_at_period_end;
  }
  if (status === "expiring") {
    const value = row.subscription?.current_period_ends_at ?? row.account?.prime_expires_at;
    if (!value || row.account?.status !== "active") return false;
    const remaining = new Date(value).getTime() - now;
    return remaining >= 0 && remaining <= 7 * 86_400_000;
  }
  if (status === "canceling") return Boolean(row.subscription?.cancel_at_period_end);
  if (status === "attention") return row.account?.status === "past_due";
  if (status === "cancelled") return row.account?.status === "cancelled";
  return true;
}
