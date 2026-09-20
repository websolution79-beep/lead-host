const DEFAULT_ID_BATCH_SIZE = 100;

type BatchResult<T> = {
  data: T[] | null;
  error: unknown;
};

export async function readRowsInIdBatches<T>(
  ids: readonly string[],
  query: (batch: string[]) => PromiseLike<BatchResult<T>>,
  batchSize = DEFAULT_ID_BATCH_SIZE,
) {
  if (!ids.length) return [] as T[];

  const uniqueIds = [...new Set(ids)];
  const rows: T[] = [];

  for (let index = 0; index < uniqueIds.length; index += batchSize) {
    const batch = uniqueIds.slice(index, index + batchSize);
    const result = await query(batch);
    if (result.error) throw result.error;
    rows.push(...(result.data ?? []));
  }

  return rows;
}
