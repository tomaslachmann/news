/** Shared by every keyset-paginated list (HistoryPage, IngestionReviewPage's Drafts queue) —
 *  the "Načíst další" button driven by usePaginatedQuery's fetchNextPage/isFetchingNextPage. */
export function LoadMoreButton({ onClick, isFetching }: { onClick: () => void; isFetching: boolean }) {
  return (
    <button className="btn" onClick={onClick} disabled={isFetching}>
      {isFetching ? 'Načítání…' : 'Načíst další'}
    </button>
  )
}
