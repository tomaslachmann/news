import { useQuery } from '@tanstack/react-query'
import { usePaginatedQuery } from '../pagination'
import { fetchThreadDetail, fetchThreadsPage } from './index'

export function useThreadDetail(slug: string | undefined) {
  return useQuery({
    queryKey: ['thread', slug],
    queryFn: () => fetchThreadDetail(slug!),
    enabled: !!slug,
  })
}

export function useThreadsList() {
  return usePaginatedQuery(['threads'], fetchThreadsPage)
}
