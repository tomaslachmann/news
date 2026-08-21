import type {
  AnalysisDetail,
  AnalysisListItem,
  DimensionItem,
  EntityMentionItem,
  RelatedEventItem,
  ThreadSummaryItem,
} from '@news-triangulator/shared'
import type {
  AnalysisWithDetails,
  AnalysisListRow,
  AnalysisStatus,
  DraftListRow,
} from '../repositories/analysis.js'
import type { EntityMentionRow } from '../repositories/entity.js'
import { toCoverageInfo } from './coverage.js'
import { interpretSourceOverlap } from '../services/sourceOverlap.js'
import { countValidExtractions } from '../services/extractionPass.js'
import { mergeAgreementCategory } from '../services/synthesisPass.js'

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

export function toEntityMentionItem(row: EntityMentionRow): EntityMentionItem {
  return { key: row.key, canonicalName: row.canonicalName, type: row.type }
}

export function toAnalysisDetail(
  analysis: AnalysisWithDetails,
  relatedEvents: RelatedEventItem[],
  thread: ThreadSummaryItem | undefined,
  entities: EntityMentionItem[]
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
      ? mergeAgreementCategory(
          analysis.synthesisResult.dimensions,
          analysis.synthesisResult.agreementCategory
        )
      : undefined,
    // Ticket 38 / ADR 0030 — interpreted here, once, so the frontend never re-derives the
    // ok/mid/bad boundaries itself. Undefined (not 0) when there's nothing to measure.
    // `sourceCount` is recomputed from `analysis.coverages` (via the same predicate
    // analysisStream.ts used to build synthesis's own source list) rather than reusing
    // `coverages.length` — a Coverage can be attached and even status:'OK' without its
    // extraction having passed schema validation, so `coverages.length` can overstate the
    // sources the percentage was actually computed from.
    sourceOverlap:
      analysis.synthesisResult?.sourceOverlapPercentage != null
        ? {
            percentage: analysis.synthesisResult.sourceOverlapPercentage,
            sourceCount: countValidExtractions(analysis.coverages),
            tier: interpretSourceOverlap(analysis.synthesisResult.sourceOverlapPercentage),
          }
        : undefined,
    narrative: analysis.synthesisResult?.narrative
      ? (analysis.synthesisResult.narrative as unknown as DimensionItem[])
      : undefined,
    relatedEvents,
    thread,
    entities,
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
