import { useQuery } from '@tanstack/react-query'
import { fetchAnalysis } from './index'

export function useAnalysisDetail(analysisId: string | undefined) {
  return useQuery({
    queryKey: ['analysis', analysisId],
    queryFn: () => fetchAnalysis(analysisId!),
    enabled: !!analysisId,
  })
}
