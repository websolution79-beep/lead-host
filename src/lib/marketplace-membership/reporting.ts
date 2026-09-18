export function subscriptionReportingPrice(slug: string | undefined, metadata: unknown, catalogPrice: number | null) {
  if (slug !== "marketplace") return catalogPrice;
  const amount = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>).monthly_price_cents : null;
  return typeof amount === "number" && Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export async function readAllReportRows<T>(load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const result = await load(from, from + 499);
    if (result.error) throw result.error;
    rows.push(...result.data ?? []);
    if ((result.data?.length ?? 0) < 500) return { data: rows, error: null };
  }
}
