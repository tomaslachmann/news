import type {
  StoryRelation,
  StoryRelationType,
  StoryRelationConfidenceTier,
  StoryRelationStatus,
} from '@prisma/client'
import { prisma } from '../db.js'
import type { AnalysisStatus } from './analysis.js'

export type { StoryRelation }

export interface RawRelationCandidateStory {
  storyId: string
  analysisId: string
  anchorHeadline: string
  embedding: number[]
  entities: unknown
  entityRelations: unknown
  createdAt: Date
}

/** Stories (any Analysis status — cheap to score regardless of whether a candidate is finished
 *  yet, mirrors findRecentStoriesForMatching's own "every status" philosophy) created strictly
 *  before `beforeStoryCreatedAt` and within `sinceHours` of it — the candidate pool ticket 35's
 *  cheap scoring ranks before any LLM call happens. Both bounds are anchored to the *Story's own*
 *  `createdAt`, not wall-clock "now" at query time: a Draft can sit in the Ingestion review queue
 *  long after it was created (see ingestionService.ts's approveDraft), so anchoring to "now"
 *  would both shift the window away from what actually happened around the Story's creation and
 *  — more importantly — could return Stories *newer* than the one generating candidates,
 *  inverting the fromStoryId=newer/toStoryId=older directional invariant this table's own
 *  StoryRelation model documents (see ADR 0022) and risking a reverse-duplicate
 *  (fromStoryId,toStoryId) pair the `@@unique` constraint doesn't catch since it's directional.
 *  The strict `createdAt <` upper bound rules both problems out structurally: only one of any two
 *  Stories can ever be "older," so at most one direction of an edge is ever generated for a pair.
 *  Excludes `excludeStoryId` (the Story generating candidates for itself doesn't need itself as a
 *  candidate — redundant given the createdAt bound, but explicit). Own window, distinct from
 *  storyMatching.ts's DEDUP_WINDOW_HOURS — see storyRelationScoring.ts. `entities`/
 *  `entityRelations` are returned raw (unknown); callers parse them via
 *  storyRelationScoring.ts's toRelationCandidateStory, keeping this repository free of any
 *  service-layer import. */
export async function findRelationCandidateStories(
  excludeStoryId: string,
  beforeStoryCreatedAt: Date,
  sinceHours: number
): Promise<RawRelationCandidateStory[]> {
  const since = new Date(beforeStoryCreatedAt.getTime() - sinceHours * 60 * 60 * 1000)
  const rows = await prisma.story.findMany({
    where: {
      id: { not: excludeStoryId },
      createdAt: { gte: since, lt: beforeStoryCreatedAt },
      analysis: { isNot: null },
    },
    include: { analysis: { select: { id: true } } },
  })

  return rows
    .filter((r): r is typeof r & { analysis: NonNullable<(typeof r)['analysis']> } => r.analysis !== null)
    .map((r) => ({
      storyId: r.id,
      analysisId: r.analysis.id,
      anchorHeadline: r.anchorHeadline,
      embedding: r.embedding,
      entities: r.entities,
      entityRelations: r.entityRelations,
      createdAt: r.createdAt,
    }))
}

export interface CreateStoryRelationInput {
  fromStoryId: string
  toStoryId: string
  type: StoryRelationType
  confidenceTier: StoryRelationConfidenceTier
  reasoning: string
  status: StoryRelationStatus
}

/** Idempotent: upserts on the (fromStoryId, toStoryId) unique constraint so a retried
 *  relation-linking pass for the same Story never creates a duplicate row for a pair already
 *  covered — see ticket 35. A no-op update on conflict; the first write for a pair wins. */
export async function createStoryRelation(data: CreateStoryRelationInput): Promise<StoryRelation> {
  return prisma.storyRelation.upsert({
    where: { fromStoryId_toStoryId: { fromStoryId: data.fromStoryId, toStoryId: data.toStoryId } },
    create: data,
    update: {},
  })
}

export interface PendingReviewRelationRow {
  id: string
  fromAnalysisId: string
  fromSeedHeadline: string
  fromHeadline: string | null
  toAnalysisId: string
  toSeedHeadline: string
  toHeadline: string | null
  type: StoryRelationType
  reasoning: string
  createdAt: Date
}

/** Every `PENDING_REVIEW` StoryRelation (ticket 36's Admin review queue), flattened with both
 *  sides' Analysis id/seedHeadline/headline — everything `resolveDisplayTitle` needs for each
 *  side, computed by the caller (mappers/analysis.ts) rather than here, keeping this repository
 *  Prisma-only. A row whose either side somehow has no Analysis (structurally shouldn't happen —
 *  every Story is created with one in the same transaction, but the schema doesn't guarantee it)
 *  is skipped rather than shown with a broken title. */
export async function findPendingReviewRelations(): Promise<PendingReviewRelationRow[]> {
  const rows = await prisma.storyRelation.findMany({
    where: { status: 'PENDING_REVIEW' },
    orderBy: { createdAt: 'desc' },
    include: {
      fromStory: { include: { analysis: { include: { synthesisResult: { select: { headline: true } } } } } },
      toStory: { include: { analysis: { include: { synthesisResult: { select: { headline: true } } } } } },
    },
  })

  const result: PendingReviewRelationRow[] = []
  for (const r of rows) {
    if (!r.fromStory.analysis || !r.toStory.analysis) continue
    result.push({
      id: r.id,
      fromAnalysisId: r.fromStory.analysis.id,
      fromSeedHeadline: r.fromStory.analysis.seedHeadline,
      fromHeadline: r.fromStory.analysis.synthesisResult?.headline ?? null,
      toAnalysisId: r.toStory.analysis.id,
      toSeedHeadline: r.toStory.analysis.seedHeadline,
      toHeadline: r.toStory.analysis.synthesisResult?.headline ?? null,
      type: r.type,
      reasoning: r.reasoning,
      createdAt: r.createdAt,
    })
  }
  return result
}

export async function findStoryRelationById(id: string): Promise<StoryRelation | null> {
  return prisma.storyRelation.findUnique({ where: { id } })
}

/** Like updateAnalysisStatusIfCurrently (repositories/analysis.ts) — only writes if the row is
 *  still `fromStatus`, returning whether the transition actually happened. Guards against an
 *  Admin double-clicking approve then reject (or two admins acting on the same row) racing a
 *  plain read-check-then-write, where the last write to commit would silently win regardless of
 *  which action the Admin actually intended last. */
export async function updateStoryRelationStatusIfCurrently(
  id: string,
  fromStatus: StoryRelationStatus,
  toStatus: StoryRelationStatus
): Promise<boolean> {
  const result = await prisma.storyRelation.updateMany({
    where: { id, status: fromStatus },
    data: { status: toStatus },
  })
  return result.count > 0
}

export interface RawStoryRelationForEvents {
  fromStoryId: string
  toStoryId: string
  type: StoryRelationType
  fromAnalysisId: string
  fromSeedHeadline: string
  fromHeadline: string | null
  fromStatus: AnalysisStatus
  fromCoverageCount: number
  toAnalysisId: string
  toSeedHeadline: string
  toHeadline: string | null
  toStatus: AnalysisStatus
  toCoverageCount: number
}

/** Every `PUBLISHED` StoryRelation touching `storyId`, either side, with both sides' Analysis
 *  id/seedHeadline/headline/status/coverageCount flattened raw — ticket 37's Related Events
 *  section. Deliberately returns *both* sides rather than pre-selecting "the other one": which
 *  side is "other" depends on `storyId`, and that JS-level decision plus the COMPLETE-only
 *  filter belong in mappers/storyRelation.ts's `toRelatedEvents` (a pure, directly-testable
 *  function), not baked into this query — see that function's own docs. A row whose either side
 *  somehow has no Analysis (shouldn't happen — see findRelationCandidateStories's identical
 *  note) is skipped. `coverageCount` matches AnalysisListRow's own convention: OK, non-excluded
 *  Coverage only. */
export async function findPublishedRelationsForStory(storyId: string): Promise<RawStoryRelationForEvents[]> {
  const analysisInclude = {
    include: {
      synthesisResult: { select: { headline: true } },
      _count: { select: { coverages: { where: { status: 'OK' as const, excluded: false } } } },
    },
  }

  const rows = await prisma.storyRelation.findMany({
    where: { status: 'PUBLISHED', OR: [{ fromStoryId: storyId }, { toStoryId: storyId }] },
    include: {
      fromStory: { include: { analysis: analysisInclude } },
      toStory: { include: { analysis: analysisInclude } },
    },
  })

  const result: RawStoryRelationForEvents[] = []
  for (const r of rows) {
    if (!r.fromStory.analysis || !r.toStory.analysis) continue
    result.push({
      fromStoryId: r.fromStoryId,
      toStoryId: r.toStoryId,
      type: r.type,
      fromAnalysisId: r.fromStory.analysis.id,
      fromSeedHeadline: r.fromStory.analysis.seedHeadline,
      fromHeadline: r.fromStory.analysis.synthesisResult?.headline ?? null,
      fromStatus: r.fromStory.analysis.status,
      fromCoverageCount: r.fromStory.analysis._count.coverages,
      toAnalysisId: r.toStory.analysis.id,
      toSeedHeadline: r.toStory.analysis.seedHeadline,
      toHeadline: r.toStory.analysis.synthesisResult?.headline ?? null,
      toStatus: r.toStory.analysis.status,
      toCoverageCount: r.toStory.analysis._count.coverages,
    })
  }
  return result
}
