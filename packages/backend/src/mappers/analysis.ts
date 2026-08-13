import type { AnalysisDetail, AnalysisDimensions, AnalysisListItem } from '@news-triangulator/shared'
import type { AnalysisWithDetails, AnalysisListRow } from '../repositories/analysis.js'
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

export function toAnalysisListItem(row: AnalysisListRow): AnalysisListItem {
  return {
    id: row.id,
    seedHeadline: row.seedHeadline,
    createdAt: row.createdAt.toISOString(),
    coverageCount: row.okCoverageCount,
    status: row.status.toLowerCase() as AnalysisListItem['status'],
  }
}
