/** ±1 page around the current one is always shown alongside first/last. */
const WINDOW = 1

/** The page tokens to render in `AdminPagination` (ticket 88): the current page ±`WINDOW`, first
 *  and last always shown, gaps collapsed to an `'…'` ellipsis. Pure so it's unit-tested without
 *  rendering. `current`/`pageCount` are 1-based; `pageCount` is always ≥ 1. */
export function buildPageList(current: number, pageCount: number): (number | '…')[] {
  if (pageCount <= 1) return [1]

  const pages = new Set<number>([1, pageCount])
  for (let p = current - WINDOW; p <= current + WINDOW; p++) {
    if (p >= 1 && p <= pageCount) pages.add(p)
  }

  const sorted = [...pages].sort((a, b) => a - b)
  const out: (number | '…')[] = []
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push('…')
    out.push(sorted[i])
  }
  return out
}

/** "1–20 z 57" style range label for the current page. `total` 0 → "0 z 0". */
export function pageRangeLabel(page: number, pageSize: number, total: number): string {
  if (total === 0) return '0 z 0'
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return `${from}–${to} z ${total}`
}
