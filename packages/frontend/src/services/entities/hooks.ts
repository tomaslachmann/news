import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { searchEntities, fetchEntityDetail } from './index'

export function useEntitySearch(query: string) {
  const trimmed = query.trim()
  return useQuery({
    queryKey: ['entities', 'search', trimmed],
    queryFn: () => searchEntities(trimmed),
    enabled: trimmed.length > 0,
  })
}

/** `EntityDetail.events` is the only paginated part of the response (keyset, ticket 42) —
 *  `canonicalName`/`type`/`wikidataId`/`relations` are the same on every page, so the page's own
 *  render reads those off the first loaded page while `events` accumulates across pages, the same
 *  shape `usePaginatedQuery` (services/pagination.ts) gives every other cursor-paginated list; this
 *  can't reuse that helper directly since the fetch here returns the whole `EntityDetail`, not a
 *  bare `Page<T>`. */
export function useEntityDetail(entityKey: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['entity', entityKey],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => fetchEntityDetail(entityKey!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.events.nextCursor ?? undefined,
    enabled: !!entityKey,
  })
}
