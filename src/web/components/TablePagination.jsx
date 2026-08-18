import { ChevronLeft, ChevronRight } from 'lucide-react';

export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 25, 50];

export function paginateList(items, page, pageSize = DEFAULT_PAGE_SIZE) {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * pageSize;

  return {
    items: items.slice(offset, offset + pageSize),
    totalItems,
    totalPages,
    page: safePage,
    offset,
  };
}

export default function TablePagination({
  totalItems,
  totalPages: totalPagesProp,
  page,
  pageSize = DEFAULT_PAGE_SIZE,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  onPageChange,
  onPageSizeChange,
  itemLabel = 'baris',
}) {
  const MAX_VISIBLE_PAGES = 5;
  const safeTotalItems = Math.max(0, Number(totalItems || 0));
  const derivedTotalPages = Math.max(1, Math.ceil(safeTotalItems / pageSize) || 1);
  const totalPages = Math.max(1, Number(totalPagesProp) || derivedTotalPages);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * pageSize;
  const start = safeTotalItems === 0 ? 0 : offset + 1;
  const end = Math.min(offset + pageSize, safeTotalItems);
  const visibleCount = Math.min(MAX_VISIBLE_PAGES, totalPages);
  const halfWindow = Math.floor(visibleCount / 2);
  let startPage = Math.max(1, safePage - halfWindow);
  let endPage = startPage + visibleCount - 1;

  if (endPage > totalPages) {
    endPage = totalPages;
    startPage = Math.max(1, endPage - visibleCount + 1);
  }

  const visiblePages = Array.from(
    { length: Math.max(0, endPage - startPage + 1) },
    (_, idx) => startPage + idx
  );

  return (
    <div className="flex flex-col gap-2 border-t border-slate-100 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <p className="text-[12px] text-slate-400 font-medium">
        Menampilkan <span className="font-semibold">{start}</span> -{' '}
        <span className="font-semibold">{end}</span> dari{' '}
        <span className="font-semibold">{safeTotalItems}</span> {itemLabel}
      </p>

      <div className="flex items-center justify-between gap-2 sm:justify-end">
        {onPageSizeChange ? (
          <div className="flex items-center gap-2 text-sm flex-shrink-0">
            <span className="text-gray-400 text-sm hidden sm:inline">Baris:</span>
            <select
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {totalPages > 1 ? (
          <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, safePage - 1))}
            disabled={safePage === 1}
            className="p-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            aria-label="Halaman sebelumnya"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          {visiblePages.map((pageNum) => {
            return (
              <button
                key={pageNum}
                type="button"
                onClick={() => onPageChange(pageNum)}
                className={`w-7 h-7 flex items-center justify-center rounded-lg text-[12px] font-bold border transition-all ${
                safePage === pageNum
                  ? 'bg-brand-700 border-brand-700 text-white shadow-sm'
                  : 'border-slate-200 text-slate-600 hover:bg-brand-50 hover:border-brand-300'
                }`}
              >
                {pageNum}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
            disabled={safePage === totalPages}
            className="p-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            aria-label="Halaman berikutnya"
          >
            <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
