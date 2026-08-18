import type {
  StoryRelation,
  StoryRelationType,
  StoryRelationConfidenceTier,
  StoryRelationStatus,
} from '@prisma/client'
import { prisma } from '../db.js'

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
