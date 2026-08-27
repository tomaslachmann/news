import { useQuery } from '@tanstack/react-query'
import { fetchAnalysis, fetchAnalyses, fetchArticles, searchArticles } from './index'
import { usePaginatedQuery } from '../pagination'

export function useAnalysisDetail(analysisId: string | undefined) {
  return useQuery({
    queryKey: ['analysis', analysisId],
    queryFn: () => fetchAnalysis(analysisId!),
    enabled: !!analysisId,
  })
}

export function useAnalysesList() {
  return usePaginatedQuery(['analyses'], fetchAnalyses)
}

export function useArticlesList() {
  return usePaginatedQuery(['articles'], fetchArticles)
}

export function useArticleSearch(query: string) {
  const trimmed = query.trim()
  return useQuery({
    queryKey: ['articles', 'search', trimmed],
    queryFn: () => searchArticles(trimmed),
    enabled: trimmed.length > 0,
  })
}
