import type {
  AnalysisDetail,
  AnalysisEntityRelationItem,
  AnalysisListItem,
  AnalysisListSummary,
  AnalysisDimensions,
  EntityMentionItem,
  NarrativeDocument,
  NarrativeLeadImage,
  RelatedEventItem,
  SourceOverlapInfo,
  ThreadSummaryItem,
} from '@news-triangulator/shared'
import type {
  AnalysisWithDetails,
  AnalysisListRow,
  AnalysisStatus,
  DraftListRow,
} from '../repositories/analysis.js'
import type { EntityMentionRow, EntityRelationForStoryRow } from '../repositories/entity.js'
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

/** Ticket 51 — `thumbnailUrl` (a provider-resized, display-ready size) over the full-resolution
 *  `imageUrl` whenever one was fetched, so the frontend never loads a multi-megabyte original for
 *  what's rendered as a single hero image. */
export function toNarrativeLeadImage(row: {
  imageUrl: string
  thumbnailUrl: string | null
  author: string | null
  license: string | null
  sourceUrl: string
}): NarrativeLeadImage {
  return {
    imageUrl: row.thumbnailUrl ?? row.imageUrl,
    author: row.author,
    license: row.license,
    sourceUrl: row.sourceUrl,
  }
}

/** Ticket 47 / ADR 0034 — every relation is already scoped to this one Analysis's own Story, so
 *  unlike `toEntityRelationItem` (mappers/entity.ts, an Entity page's cross-Story view), no
 *  `direction`/`assertedBy` disambiguation is needed here. */
export function toAnalysisEntityRelationItem(row: EntityRelationForStoryRow): AnalysisEntityRelationItem {
  return { id: row.id, type: row.type, fromEntity: row.fromEntity, toEntity: row.toEntity }
}

export function toAnalysisDetail(
  analysis: AnalysisWithDetails,
  relatedEvents: RelatedEventItem[],
  thread: ThreadSummaryItem | undefined,
  entities: EntityMentionItem[],
  entityRelations: AnalysisEntityRelationItem[]
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
    sourceOverlap: toSourceOverlapInfo(
      analysis.synthesisResult?.sourceOverlapPercentage ?? null,
      countValidExtractions(analysis.coverages)
    ),
    narrative: analysis.synthesisResult?.narrative
      ? (analysis.synthesisResult.narrative as unknown as NarrativeDocument)
      : undefined,
    leadImage: analysis.synthesisResult?.narrativeImage
      ? toNarrativeLeadImage(analysis.synthesisResult.narrativeImage)
      : undefined,
    relatedEvents,
    thread,
    entities,
    entityRelations,
  }
}

function toSourceOverlapInfo(
  sourceOverlapPercentage: number | null,
  sourceCount: number
): SourceOverlapInfo | undefined {
  return sourceOverlapPercentage != null
    ? {
        percentage: sourceOverlapPercentage,
        sourceCount,
        tier: interpretSourceOverlap(sourceOverlapPercentage),
      }
    : undefined
}

function toAnalysisListSummary(row: AnalysisListRow): AnalysisListSummary | undefined {
  if (!row.dimensions) return undefined
  const validCoverageCount = countValidExtractions(row.coverages)

  return {
    teaser: toTeaser(row.dimensions, resolveDisplayTitle(row.headline, row.seedHeadline)),
    hasConflict: row.dimensions.contradiction.length > 0,
    sourceOverlap: toSourceOverlapInfo(row.sourceOverlapPercentage, validCoverageCount),
    outlets: dedupe(row.coverages.map((coverage) => coverage.sourceName)).slice(0, 4),
    entities: dedupe(row.entityNames).slice(0, 4),
    leadImage: row.leadImage ? toNarrativeLeadImage(row.leadImage) : undefined,
  }
}

function toTeaser(dimensions: AnalysisDimensions, fallback: string): string {
  const prose =
    firstNonEmptyProse(dimensions.agreement) ??
    firstNonEmptyProse(dimensions.uniqueReporting) ??
    firstNonEmptyProse(dimensions.contradiction) ??
    firstNonEmptyProse(dimensions.framing)

  if (!prose) return fallback

  const singleLine = prose.replace(/\s+/g, ' ').trim()
  if (singleLine.length <= 220) return singleLine
  return `${singleLine.slice(0, 217).trimEnd()}...`
}

function firstNonEmptyProse(items: { prose: string }[]): string | undefined {
  return items.map((item) => item.prose.trim()).find((item) => item.length > 0)
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))]
}

export function toAnalysisListItem(row: AnalysisListRow): AnalysisListItem {
  return {
    id: row.id,
    seedHeadline: row.seedHeadline,
    title: resolveDisplayTitle(row.headline, row.seedHeadline),
    createdAt: row.createdAt.toISOString(),
    coverageCount: row.okCoverageCount,
    status: STATUS_MAP[row.status],
    summary: toAnalysisListSummary(row),
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
