import { useQuery } from '@tanstack/react-query'
import {
  fetchHomepageArticles,
  fetchHomepageContradictions,
  fetchHomepageEntityStats,
  fetchHomepageMinuteFeed,
  fetchHomepageMostRead,
  fetchHomepageSummaryStats,
} from './index'

/** Ticket 63: not polled — unlike `useHomepageMinuteFeed`'s `refetchInterval`, the main Article
 *  column doesn't need to feel "live"; `Minuta` stays the one homepage rail that does. */
export function useHomepageArticles() {
  return useQuery({
    queryKey: ['homepageStats', 'articles'],
    queryFn: fetchHomepageArticles,
  })
}

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
