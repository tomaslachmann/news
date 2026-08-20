import type {
  AnalysisDetail,
  AnalysisDimensions,
  AnalysisListItem,
  DimensionItem,
  RelatedEventItem,
  ThreadSummaryItem,
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

/** The single fallback rule for what title represents a finished Article: the tool-generated
 *  headline when one exists, otherwise the working title carried over from the seed article.
 *  `headline` is only ever non-null once an Analysis is COMPLETE (see ADR 0021), so this doubles
 *  as the "not complete yet" case without needing a separate status check — every pre-COMPLETE
 *  Analysis has no headline yet and so always resolves to its working title. See ticket 33 /
 *  the Headline entry in CONTEXT.md. */
export function resolveDisplayTitle(headline: string | null | undefined, seedHeadline: string): string {
  return headline ?? seedHeadline
}

export function toAnalysisDetail(
  analysis: AnalysisWithDetails,
  relatedEvents: RelatedEventItem[],
  thread?: ThreadSummaryItem
): AnalysisDetail {
  return {
    id: analysis.id,
    seedUrl: analysis.seedUrl,
    seedHeadline: analysis.seedHeadline,
    title: resolveDisplayTitle(analysis.synthesisResult?.headline, analysis.seedHeadline),
    createdAt: analysis.createdAt.toISOString(),
    status: STATUS_MAP[analysis.status],
    coverages: analysis.coverages.map(toCoverageInfo),
    synthesisResult: analysis.synthesisResult
      ? (analysis.synthesisResult.dimensions as unknown as AnalysisDimensions)
      : undefined,
    narrative: analysis.synthesisResult?.narrative
      ? (analysis.synthesisResult.narrative as unknown as DimensionItem[])
      : undefined,
    relatedEvents,
    thread,
  }
}

export function toAnalysisListItem(row: AnalysisListRow): AnalysisListItem {
  return {
    id: row.id,
    seedHeadline: row.seedHeadline,
    title: resolveDisplayTitle(row.headline, row.seedHeadline),
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
    title: resolveDisplayTitle(row.headline, row.seedHeadline),
    createdAt: row.createdAt.toISOString(),
    coverageCount: row.coverageCount,
    status: STATUS_MAP.DRAFT,
  }
}
