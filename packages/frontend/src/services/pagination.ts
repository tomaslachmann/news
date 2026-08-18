import { useInfiniteQuery } from '@tanstack/react-query'
import type { Page } from '@news-triangulator/shared'

/** `?cursor=...` query string for a keyset-paginated GET, or '' for the first page — shared by
 *  every fetch* function that calls a cursor-paginated endpoint. */
export function cursorQueryParam(cursor: string | undefined): string {
  return cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
}

/** The useInfiniteQuery boilerplate every cursor-paginated list hook repeated identically
 *  (queryFn's pageParam destructuring, initialPageParam, getNextPageParam reading Page's
 *  nextCursor) — code review, ticket 03. */
export function usePaginatedQuery<T>(
  queryKey: unknown[],
  fetchPage: (cursor: string | undefined) => Promise<Page<T>>
) {
  return useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => fetchPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
}
