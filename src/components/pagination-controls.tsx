"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export type PaginationState = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function PaginationControls({
  pagination,
  disabled = false,
  onPageChange,
}: {
  pagination: PaginationState;
  disabled?: boolean;
  onPageChange: (page: number) => void;
}) {
  if (pagination.totalPages <= 1) {
    return null;
  }

  const firstItem = (pagination.page - 1) * pagination.pageSize + 1;
  const lastItem = Math.min(
    pagination.page * pagination.pageSize,
    pagination.total,
  );

  return (
    <nav
      aria-label="Paginazione"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-4"
    >
      <p className="text-sm font-medium text-muted">
        {firstItem}–{lastItem} di {pagination.total}
      </p>
      <div className="flex items-center gap-2">
        <button
          aria-label="Pagina precedente"
          className="btn btn-secondary min-h-10 px-3"
          type="button"
          disabled={disabled || pagination.page <= 1}
          onClick={() => onPageChange(pagination.page - 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <span className="min-w-24 text-center text-sm font-semibold text-ink">
          {pagination.page} di {pagination.totalPages}
        </span>
        <button
          aria-label="Pagina successiva"
          className="btn btn-secondary min-h-10 px-3"
          type="button"
          disabled={disabled || pagination.page >= pagination.totalPages}
          onClick={() => onPageChange(pagination.page + 1)}
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </nav>
  );
}
