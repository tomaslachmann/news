import { useQuery } from '@tanstack/react-query'
import {
  fetchHomepageContradictions,
  fetchHomepageEntityStats,
  fetchHomepageMinuteFeed,
  fetchHomepageMostRead,
  fetchHomepageSummaryStats,
} from './index'

export function useHomepageEntityStats() {
  return useQuery({
    queryKey: ['homepageStats', 'entities'],
    queryFn: fetchHomepageEntityStats,
  })
}

export function useHomepageSummaryStats() {
  return useQuery({
    queryKey: ['homepageStats', 'summary'],
    queryFn: fetchHomepageSummaryStats,
  })
}

export function useHomepageMinuteFeed() {
  return useQuery({
    queryKey: ['homepageStats', 'minute'],
    queryFn: fetchHomepageMinuteFeed,
    refetchInterval: 60_000,
  })
}

export function useHomepageContradictions() {
  return useQuery({
    queryKey: ['homepageStats', 'contradictions'],
    queryFn: fetchHomepageContradictions,
  })
}

export function useHomepageMostRead() {
  return useQuery({
    queryKey: ['homepageStats', 'mostRead'],
    queryFn: fetchHomepageMostRead,
  })
}
