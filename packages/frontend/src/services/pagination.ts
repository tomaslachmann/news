import { useInfiniteQuery, useQuery, keepPreviousData } from '@tanstack/react-query'
import type { Page, PagedResult } from '@news-triangulator/shared'

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

/** Offset-paginated counterpart of `usePaginatedQuery` for the admin Ingestion queues (ticket
 *  88). `keepPreviousData` so paging/filtering swaps the list without a loading flash — the
 *  previous page stays visible (dimmed by the caller via `isPlaceholderData`) until the next
 *  arrives. `queryKey` must include the active filter so a changed filter refetches. */
export function usePagedQuery<T>(queryKey: unknown[], fetchPage: () => Promise<PagedResult<T>>) {
  return useQuery({ queryKey, queryFn: fetchPage, placeholderData: keepPreviousData })
}

/** Serialises an admin-queue filter object into a `?a=b&c=d` string, dropping `undefined`/empty
 *  values so a pristine queue still requests a bare, cache-friendly URL. */
export function adminQueryString(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') q.set(key, String(value))
  }
  const serialised = q.toString()
  return serialised ? `?${serialised}` : ''
}
