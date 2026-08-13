import type { AnalysisDetail, AnalysisDimensions } from '@news-triangulator/shared'
import type { AnalysisWithDetails } from '../repositories/analysis.js'
import { toCoverageInfo } from './coverage.js'

export function toAnalysisDetail(analysis: AnalysisWithDetails): AnalysisDetail {
  return {
    id: analysis.id,
    seedUrl: analysis.seedUrl,
    seedHeadline: analysis.seedHeadline,
    createdAt: analysis.createdAt.toISOString(),
    status: analysis.status.toLowerCase() as AnalysisDetail['status'],
    coverages: analysis.coverages.map(toCoverageInfo),
    synthesisResult: analysis.synthesisResult
      ? (analysis.synthesisResult.dimensions as unknown as AnalysisDimensions)
      : undefined,
  }
}
