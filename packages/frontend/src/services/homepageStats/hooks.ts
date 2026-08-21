import { useQuery } from '@tanstack/react-query'
import { fetchHomepageEntityStats } from './index'

export function useHomepageEntityStats() {
  return useQuery({
    queryKey: ['homepageStats', 'entities'],
    queryFn: fetchHomepageEntityStats,
  })
}
