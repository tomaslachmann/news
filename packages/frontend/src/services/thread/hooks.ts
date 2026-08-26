import { useQuery } from '@tanstack/react-query'
import { fetchThreadDetail } from './index'

export function useThreadDetail(slug: string | undefined) {
  return useQuery({
    queryKey: ['thread', slug],
    queryFn: () => fetchThreadDetail(slug!),
    enabled: !!slug,
  })
}
