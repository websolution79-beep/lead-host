type Candidate = { id: string; profile_id: string };

// Keyset pagination stays stable when reconciliation changes subscription status.
export async function recoverMarketplaceRenewals(deps: {
  loadPage: (afterId: string | null) => Promise<Candidate[]>;
  reconcile: (profileId: string) => Promise<void>;
  onError: (id: string, error: unknown) => void;
}) {
  let cursor: string | null = null;
  let checked = 0;
  let failed = 0;
  for (;;) {
    const rows = await deps.loadPage(cursor);
    if (!rows.length) break;
    for (const row of rows) {
      try { await deps.reconcile(row.profile_id); }
      catch (error) { failed++; deps.onError(row.id, error); }
      checked++;
    }
    const next = rows[rows.length - 1].id;
    if (next === cursor) throw new Error("Marketplace recovery cursor did not advance.");
    cursor = next;
  }
  return { checked, failed };
}
