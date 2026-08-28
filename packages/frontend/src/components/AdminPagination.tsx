import { buildPageList, pageRangeLabel } from './adminPaginationModel'
import './AdminPagination.css'

/** Offset page-number pagination for the admin Ingestion queues (ticket 88) — replaces the
 *  keyset "Načíst další" button on these bounded, human-worked queues. Renders nothing extra
 *  when there's a single page; the range label ("1–20 z 57") always shows so the Admin knows the
 *  queue's real size. `busy` dims the control while a page swap is in flight. */
export function AdminPagination({
  page,
  pageSize,
  pageCount,
  total,
  onPageChange,
  busy = false,
}: {
  page: number
  pageSize: number
  pageCount: number
  total: number
  onPageChange: (page: number) => void
  busy?: boolean
}) {
  // `page` can briefly sit past `pageCount` — the last items on the final page were just
  // approved/rejected and the refetch returned a smaller count, one frame before `useClampPage`
  // snaps it back. Clamp for display so the range label never reads "41–40 z 40".
  const shownPage = Math.min(Math.max(page, 1), pageCount)
  const tokens = buildPageList(shownPage, pageCount)
  return (
    <nav className={`apager${busy ? ' apager--busy' : ''}`} aria-label="Stránkování">
      <span className="apager__range">{pageRangeLabel(shownPage, pageSize, total)}</span>
      {pageCount > 1 && (
        <div className="apager__pages">
          <button
            className="apager__b"
            type="button"
            onClick={() => onPageChange(shownPage - 1)}
            disabled={busy || shownPage <= 1}
            aria-label="Předchozí stránka"
          >
            ‹
          </button>
          {tokens.map((token, i) =>
            token === '…' ? (
              <span key={`gap-${i}`} className="apager__gap" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={token}
                className={`apager__b${token === shownPage ? ' is-current' : ''}`}
                type="button"
                onClick={() => onPageChange(token)}
                disabled={busy}
                aria-current={token === shownPage ? 'page' : undefined}
              >
                {token}
              </button>
            )
          )}
          <button
            className="apager__b"
            type="button"
            onClick={() => onPageChange(shownPage + 1)}
            disabled={busy || shownPage >= pageCount}
            aria-label="Další stránka"
          >
            ›
          </button>
        </div>
      )}
    </nav>
  )
}
