export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 50;

export function readPagination(searchParams: URLSearchParams) {
  const page = readPositiveInteger(searchParams.get("page"), 1);
  const pageSize = Math.min(
    readPositiveInteger(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );
  const from = (page - 1) * pageSize;

  return {
    page,
    pageSize,
    from,
    to: from + pageSize - 1,
  };
}

export function buildPagination(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function readPositiveInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
