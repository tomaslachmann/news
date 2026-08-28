/** Shared by every keyset-paginated list (HistoryPage, CategoryPage, ThreadsPage,
 *  EntityDetailPage) — the "Načíst další" button driven by usePaginatedQuery's
 *  fetchNextPage/isFetchingNextPage. The admin Ingestion queues use offset page numbers
 *  (AdminPagination) instead — see ticket 88. */
export function LoadMoreButton({ onClick, isFetching }: { onClick: () => void; isFetching: boolean }) {
  return (
    <button className="btn" onClick={onClick} disabled={isFetching}>
      {isFetching ? 'Načítání…' : 'Načíst další'}
    </button>
  )
}
