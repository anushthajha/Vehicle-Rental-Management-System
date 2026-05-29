import React, { useEffect, useMemo, useState } from 'react'

function clamp(value, min, max) {
  const numeric = Number.parseInt(value, 10)
  if (Number.isNaN(numeric)) return min
  return Math.min(Math.max(numeric, min), Math.max(min, max))
}

export function getStoredPagination(pageName, defaults = { itemsPerPage: 10, page: 1 }) {
  if (typeof window === 'undefined' || !pageName) return defaults
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`sigfleet_pagination_${pageName}`) || '{}')
    return {
      itemsPerPage: Math.max(1, Number(parsed.itemsPerPage || defaults.itemsPerPage)),
      page: Math.max(1, Number(parsed.page || defaults.page)),
    }
  } catch {
    return defaults
  }
}

export function saveStoredPagination(pageName, value) {
  if (typeof window === 'undefined' || !pageName) return
  window.localStorage.setItem(`sigfleet_pagination_${pageName}`, JSON.stringify(value))
}

export default function Pagination({
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  itemLabel = 'items',
}) {
  const totalPages = Math.max(1, Math.ceil((totalItems || 0) / Math.max(itemsPerPage || 1, 1)))
  const [pageDraft, setPageDraft] = useState(String(currentPage || 1))
  const [limitDraft, setLimitDraft] = useState(String(itemsPerPage || 10))
  const from = totalItems ? ((currentPage - 1) * itemsPerPage) + 1 : 0
  const to = Math.min(currentPage * itemsPerPage, totalItems || 0)

  useEffect(() => setPageDraft(String(currentPage || 1)), [currentPage])
  useEffect(() => setLimitDraft(String(itemsPerPage || 10)), [itemsPerPage])

  const disabled = useMemo(() => ({
    start: currentPage <= 1,
    end: currentPage >= totalPages,
  }), [currentPage, totalPages])

  function commitPage(value = pageDraft) {
    onPageChange(clamp(value, 1, totalPages))
  }

  function commitLimit(value = limitDraft) {
    const next = clamp(value, 1, Math.max(totalItems || 1, 1))
    onItemsPerPageChange(next)
  }

  const navClass = 'grid h-9 w-9 place-items-center rounded-md border border-zinc-300 bg-white text-sm font-black text-zinc-700 transition hover:border-sigfleet hover:text-sigfleet disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-3 text-sm font-bold text-zinc-700 shadow-sm md:flex-row md:items-center md:justify-between">
      <p className="whitespace-nowrap">Showing {from}-{to} of {totalItems || 0} {itemLabel}</p>
      <div className="flex items-center justify-center gap-2">
        <button type="button" className={navClass} disabled={disabled.start} onClick={() => onPageChange(1)} aria-label="First page">«</button>
        <button type="button" className={navClass} disabled={disabled.start} onClick={() => onPageChange(currentPage - 1)} aria-label="Previous page">‹</button>
        <input
          type="number"
          min="1"
          max={totalPages}
          value={pageDraft}
          onChange={(event) => setPageDraft(event.target.value)}
          onBlur={() => commitPage()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitPage()
          }}
          className="h-9 w-[60px] rounded-md border border-sigfleet text-center text-sm font-black text-sigfleet outline-none focus:ring-2 focus:ring-red-100"
          aria-label="Page number"
        />
        <span className="whitespace-nowrap text-zinc-500">of {totalPages}</span>
        <button type="button" className={navClass} disabled={disabled.end} onClick={() => onPageChange(currentPage + 1)} aria-label="Next page">›</button>
        <button type="button" className={navClass} disabled={disabled.end} onClick={() => onPageChange(totalPages)} aria-label="Last page">»</button>
      </div>
      <label className="flex items-center justify-end gap-2 whitespace-nowrap">
        per page:
        <input
          type="number"
          min="1"
          max={Math.max(totalItems || 1, 1)}
          value={limitDraft}
          onChange={(event) => setLimitDraft(event.target.value)}
          onBlur={() => commitLimit()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitLimit()
          }}
          className="h-9 w-[60px] rounded-md border border-zinc-300 text-center text-sm font-black outline-none focus:border-sigfleet focus:ring-2 focus:ring-red-100"
        />
      </label>
    </div>
  )
}
