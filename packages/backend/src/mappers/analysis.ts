import type {
  AnalysisDetail,
  AnalysisDimensions,
  AnalysisListItem,
  DimensionItem,
} from '@news-triangulator/shared'
import type {
  AnalysisWithDetails,
  AnalysisListRow,
  AnalysisStatus,
  DraftListRow,
} from '../repositories/analysis.js'
import { toCoverageInfo } from './coverage.js'

export const STATUS_MAP: Record<AnalysisStatus, AnalysisDetail['status']> = {
  DRAFT: 'draft',
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

/** Same target shape as toAnalysisListItem, for the Ingestion review queue's Draft rows — whose
 *  coverageCount counts every non-excluded Coverage (always PENDING pre-approval), not just
 *  status:'OK' ones, so it's kept as a distinct source field rather than forced into
 *  okCoverageCount's narrower meaning. Reuses STATUS_MAP so both mappers can't drift apart. */
export function toVisibleDraftListItem(row: DraftListRow): AnalysisListItem {
  return {
    id: row.id,
    seedHeadline: row.seedHeadline,
    createdAt: row.createdAt.toISOString(),
    coverageCount: row.coverageCount,
    status: STATUS_MAP.DRAFT,
  }
}
