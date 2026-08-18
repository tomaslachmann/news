import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { FastifyBaseLogger } from 'fastify'
import { callJsonModel } from './llmClient.js'
import {
  scoreRelationCandidates,
  RELATION_CANDIDATE_WINDOW_HOURS,
  toRelationCandidateStory,
  type RelationCandidateInput,
  type RelationCandidateStory,
} from './storyRelationScoring.js'
import { parseStoredEntities, parseStoredEntityRelations } from './entityTypes.js'
import { extractAndPersistStoryEntities } from './entityExtractionPass.js'
import type { RawRelationCandidateStory } from '../repositories/storyRelation.js'

const SYSTEM_PROMPT = readFileSync(join(__dirname, '../prompts/storyRelation.txt'), 'utf8')

// Only the top handful of scoreRelationCandidates' ranked pool (~20) ever reaches an LLM call —
// this is that cutoff. Distinct constant from RELATION_CANDIDATE_POOL_SIZE: the pool is the
// cheap-scoring shortlist, this is the expensive-LLM-call shortlist within it.
export const RELATION_SHORTLIST_SIZE = 5

const StoryRelationTypeSchema = z.enum(['RELATED', 'FOLLOW_UP'])
const ConfidenceTierSchema = z.enum(['HIGH', 'LOW'])

const StoryRelationVerdictSchema = z.union([
  z.object({ related: z.literal(false) }),
  z.object({
    related: z.literal(true),
    type: StoryRelationTypeSchema,
    confidenceTier: ConfidenceTierSchema,
    reasoning: z.string().min(1),
  }),
])

export type StoryRelationVerdict = z.infer<typeof StoryRelationVerdictSchema>

interface StoryDescriptor {
  anchorHeadline: string
  createdAt: Date
}

/**
 * Asks whether `current` (the newer Story) connects to `candidate` (an older, already-visible
 * Story) and if so, how — RELATED or FOLLOW_UP, never a causal type (ADR 0012 keeps this tool
 * from asserting one event caused another), with a HIGH/LOW confidence tier rather than a raw
 * score. A thrown error is not caught here — linkStoryRelations degrades gracefully per
 * candidate on failure, matching every other pass's "extract or throw" contract.
 */
export async function confirmStoryRelation(
  current: StoryDescriptor,
  candidate: StoryDescriptor,
  log?: FastifyBaseLogger
): Promise<StoryRelationVerdict> {
  const model = process.env.EXTRACTION_MODEL ?? 'gpt-4o'
  const userContent = JSON.stringify({
    storyA: { headline: current.anchorHeadline, publishedAt: current.createdAt.toISOString() },
    storyB: { headline: candidate.anchorHeadline, publishedAt: candidate.createdAt.toISOString() },
  })
  const parsed = StoryRelationVerdictSchema.parse(
    await callJsonModel(model, SYSTEM_PROMPT, userContent, 'storyRelation')
  )
  log?.info({ candidate: candidate.anchorHeadline, verdict: parsed }, 'Story relation confirmation')
  return parsed
}

export interface CreateStoryRelationData {
  fromStoryId: string
  toStoryId: string
  type: z.infer<typeof StoryRelationTypeSchema>
  confidenceTier: z.infer<typeof ConfidenceTierSchema>
  reasoning: string
  status: 'PUBLISHED' | 'PENDING_REVIEW'
}

export interface LinkStoryRelationsDeps {
  // Returns unknown, not void — the repository's createStoryRelation returns the upserted row
  // (useful for its own callers/tests), and this orchestration function never needs that value.
  createStoryRelation: (data: CreateStoryRelationData) => Promise<unknown>
}

/**
 * The full relation-candidate-generation-to-persistence pipeline for one Story (ticket 35): cheap
 * scoring narrows a candidate pool down to a shortlist, only that shortlist gets an LLM
 * confirmation call, and every confirmed relation is persisted — PUBLISHED for HIGH confidence,
 * PENDING_REVIEW for LOW. Never throws: a failure at any stage (scoring, one candidate's
 * confirmation call, or persisting one candidate's result) is logged and skipped, never allowed
 * to block the caller's own flow (approveDraft, confirmCoverages) or stop the remaining
 * candidates in the shortlist from still being evaluated.
 */
export async function linkStoryRelations(
  storyId: string,
  current: RelationCandidateInput & StoryDescriptor,
  candidatePool: RelationCandidateStory[],
  deps: LinkStoryRelationsDeps,
  log?: FastifyBaseLogger
): Promise<void> {
  let shortlist: RelationCandidateStory[]
  try {
    shortlist = scoreRelationCandidates(current, candidatePool, new Date()).slice(0, RELATION_SHORTLIST_SIZE)
  } catch (err) {
    log?.warn({ storyId, err }, 'Story relation candidate scoring failed; no relations created')
    return
  }

  // Each candidate's confirmation call is independent of every other's — run them concurrently
  // rather than one at a time, so a shortlist of RELATION_SHORTLIST_SIZE doesn't serialize that
  // many LLM round trips into approveDraft/confirmCoverages's own response time.
  await Promise.allSettled(
    shortlist.map(async (candidateStory) => {
      try {
        const verdict = await confirmStoryRelation(current, candidateStory, log)
        if (!verdict.related) return
        await deps.createStoryRelation({
          fromStoryId: storyId,
          toStoryId: candidateStory.storyId,
          type: verdict.type,
          confidenceTier: verdict.confidenceTier,
          reasoning: verdict.reasoning,
          status: verdict.confidenceTier === 'HIGH' ? 'PUBLISHED' : 'PENDING_REVIEW',
        })
      } catch (err) {
        log?.warn(
          { storyId, candidateStoryId: candidateStory.storyId, err },
          'Story relation confirmation or persistence failed for this candidate; skipping'
        )
      }
    })
  )
}

export interface StoryForRelationPipeline {
  anchorHeadline: string
  createdAt: Date
  embedding: number[]
  /** Currently-persisted, raw (unparsed) — the fallback used when this round's extraction finds
   *  nothing new, so a retried/second call never scores relation candidates against an empty
   *  signal when a Story already has good entities/entityRelations from an earlier pass. */
  entities: unknown
  entityRelations: unknown
}

export interface EntityAndRelationPipelineDeps {
  updateStoryEntities: (storyId: string, entities: unknown, entityRelations: unknown) => Promise<void>
  findRelationCandidateStories: (
    excludeStoryId: string,
    beforeStoryCreatedAt: Date,
    sinceHours: number
  ) => Promise<RawRelationCandidateStory[]>
  createStoryRelation: (data: CreateStoryRelationData) => Promise<unknown>
}

/**
 * The full ticket 34 + ticket 35 pipeline for one Story: extract & persist entities, then use
 * them — falling back to whatever is already persisted on `story` if this round's extraction
 * found nothing new — to generate and persist Story relations. Shared by both trigger points
 * (approveDraft, confirmCoverages) so this sequencing, and its fresh-or-persisted fallback, live
 * in exactly one place rather than being reimplemented at each call site. Never throws: entity
 * extraction degrades gracefully on its own (extractAndPersistStoryEntities), and everything
 * from the candidate-pool fetch onward is caught here — nothing in this pipeline is allowed to
 * block the caller's own flow.
 */
export async function extractEntitiesAndLinkStoryRelations(
  storyId: string,
  sourceTexts: string[],
  story: StoryForRelationPipeline,
  deps: EntityAndRelationPipelineDeps,
  log?: FastifyBaseLogger
): Promise<void> {
  const freshExtraction = await extractAndPersistStoryEntities(
    storyId,
    sourceTexts,
    deps.updateStoryEntities,
    log
  )

  try {
    const entities = freshExtraction?.entities ?? parseStoredEntities(story.entities)
    const entityRelations =
      freshExtraction?.entityRelations ?? parseStoredEntityRelations(story.entityRelations)
    const rawCandidates = await deps.findRelationCandidateStories(
      storyId,
      story.createdAt,
      RELATION_CANDIDATE_WINDOW_HOURS
    )

    await linkStoryRelations(
      storyId,
      {
        anchorHeadline: story.anchorHeadline,
        createdAt: story.createdAt,
        embedding: story.embedding,
        entities,
        entityRelations,
      },
      rawCandidates.map(toRelationCandidateStory),
      { createStoryRelation: deps.createStoryRelation },
      log
    )
  } catch (err) {
    log?.warn({ storyId, err }, 'Story relation candidate generation failed; no relations created')
  }
}
