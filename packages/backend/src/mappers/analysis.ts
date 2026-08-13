import type {
  AnalysisDetail,
  AnalysisDimensions,
  AnalysisListItem,
  DimensionItem,
} from '@news-triangulator/shared'
import type { AnalysisWithDetails, AnalysisListRow, AnalysisStatus } from '../repositories/analysis.js'
import { toCoverageInfo } from './coverage.js'

const STATUS_MAP: Record<AnalysisStatus, AnalysisDetail['status']> = {
  PENDING: 'pending',
  COMPLETE: 'complete',
  FAILED: 'failed',
}

export function toAnalysisDetail(analysis: AnalysisWithDetails): AnalysisDetail {
  return {
    id: analysis.id,
    seedUrl: analysis.seedUrl,
    seedHeadline: analysis.seedHeadline,
    createdAt: analysis.createdAt.toISOString(),
    status: STATUS_MAP[analysis.status],
    coverages: analysis.coverages.map(toCoverageInfo),
    synthesisResult: analysis.synthesisResult
      ? (analysis.synthesisResult.dimensions as unknown as AnalysisDimensions)
      : undefined,
    narrative: analysis.synthesisResult?.narrative
      ? (analysis.synthesisResult.narrative as unknown as DimensionItem[])
      : undefined,
  }
}

export function toAnalysisListItem(row: AnalysisListRow): AnalysisListItem {
  return {
    id: row.id,
    seedHeadline: row.seedHeadline,
    createdAt: row.createdAt.toISOString(),
    coverageCount: row.okCoverageCount,
    status: STATUS_MAP[row.status],
  }
}
