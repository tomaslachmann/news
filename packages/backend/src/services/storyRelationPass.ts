import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { FastifyBaseLogger } from 'fastify'
import { callJsonModel } from './llmClient.js'
import {
  scoreRelationCandidates,
  RELATION_CANDIDATE_WINDOW_HOURS,
  eventTimeOrFallback,
  type RelationCandidateInput,
  type RelationCandidateStory,
} from './storyRelationScoring.js'
import { extractAndPersistStoryEntities } from './entityExtractionPass.js'
import type { ExtractedEntity, ExtractedEntityRelation } from './entityTypes.js'
import type { RawRelationCandidateStory } from '../repositories/storyRelation.js'
import type { EntityForScoring, EntityRelationForScoring } from '../repositories/entity.js'
import { runStageOrThrow } from './pipelineStage.js'
import { enqueueJob } from '../jobs/enqueue.js'
import { JobName } from '../jobs/jobDefinitions.js'

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
  /** When the event happened/was first reported, not this row's own insert time — ticket 16,
   *  fixes the rest of P1-11 (docs/audit.md): this used to be `createdAt`, which drifts from the
   *  real event time whenever a Draft sits in the Ingestion review queue before approval. Null
   *  for a human-seeded Story (no reliable published date to scrape, ADR 0029's amendment) or a
   *  pre-migration Story (no backfill) — `createdAt` is the fallback wherever this is consumed,
   *  never a bare, unhandled null. */
  eventTime: Date | null
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
    storyA: { headline: current.anchorHeadline, publishedAt: eventTimeOrFallback(current).toISOString() },
    storyB: { headline: candidate.anchorHeadline, publishedAt: eventTimeOrFallback(candidate).toISOString() },
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
  totalStories: number,
  deps: LinkStoryRelationsDeps,
  log?: FastifyBaseLogger
): Promise<void> {
  let shortlist: RelationCandidateStory[]
  try {
    shortlist = scoreRelationCandidates(current, candidatePool, totalStories, new Date()).slice(
      0,
      RELATION_SHORTLIST_SIZE
    )
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
        const status = verdict.confidenceTier === 'HIGH' ? 'PUBLISHED' : 'PENDING_REVIEW'
        await deps.createStoryRelation({
          fromStoryId: storyId,
          toStoryId: candidateStory.storyId,
          type: verdict.type,
          confidenceTier: verdict.confidenceTier,
          reasoning: verdict.reasoning,
          status,
        })
        // thread.recompute (ticket 17, ADR 0028): enqueued right after a StoryRelation transitions
        // to FOLLOW_UP/PUBLISHED — not atomic with the write above (see ticket 17's Answer on why
        // this is a deliberate, narrower risk than tickets 14/15/16's own atomic enqueues; a missed
        // enqueue here self-heals the moment any other edge in the same connected component is
        // confirmed). Best-effort, degrading with the rest of this candidate's own try/catch.
        if (verdict.type === 'FOLLOW_UP' && status === 'PUBLISHED') {
          await enqueueJob(JobName.ThreadRecompute, { seedStoryId: storyId })
        }
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
  eventTime: Date | null
  embedding: number[]
}

export interface EntityAndRelationPipelineDeps {
  replaceStoryEntities: (
    storyId: string,
    entities: ExtractedEntity[],
    entityRelations: ExtractedEntityRelation[]
  ) => Promise<void>
  /** The authoritative, currently-persisted entity/entity-relation set for `storyId` — always
   *  read back after extractAndPersistStoryEntities rather than trusting its in-memory return
   *  value, so a round where this round's extraction found nothing new still scores against
   *  whatever an earlier, more successful pass persisted (ADR 0024). */
  findStoryEntitiesForScoring: (
    storyId: string
  ) => Promise<{ entities: EntityForScoring[]; entityRelations: EntityRelationForScoring[] }>
  /** Corpus size for IDF weighting (ADR 0024, fixes P1-9) — repositories/entity.ts's
   *  countStories(). */
  countStories: () => Promise<number>
  findRelationCandidateStories: (
    excludeStoryId: string,
    beforeStoryCreatedAt: Date,
    sinceHours: number
  ) => Promise<RawRelationCandidateStory[]>
  createStoryRelation: (data: CreateStoryRelationData) => Promise<unknown>
}

interface RelationCandidatePool {
  entities: EntityForScoring[]
  entityRelations: EntityRelationForScoring[]
  rawCandidates: RawRelationCandidateStory[]
  totalStories: number
}

/** The candidate-pool half of extractEntitiesAndLinkStoryRelations, split out so its
 *  try/log/rethrow (via the shared runStageOrThrow, see pipelineStage.ts) doesn't need four
 *  pre-declared `let`s destructured out of a try block. */
async function fetchRelationCandidatePool(
  storyId: string,
  createdAt: Date,
  deps: EntityAndRelationPipelineDeps,
  log?: FastifyBaseLogger
): Promise<RelationCandidatePool> {
  return runStageOrThrow({ storyId }, 'Story relation candidate-pool fetch', log, async () => {
    const [{ entities, entityRelations }, rawCandidates, totalStories] = await Promise.all([
      deps.findStoryEntitiesForScoring(storyId),
      deps.findRelationCandidateStories(storyId, createdAt, RELATION_CANDIDATE_WINDOW_HOURS),
      deps.countStories(),
    ])
    return { entities, entityRelations, rawCandidates, totalStories }
  })
}

/**
 * The full ticket 34 + ticket 35 pipeline for one Story: extract & persist entities, then read
 * back this Story's authoritative entity set — whatever this round's extraction just wrote, or
 * whatever an earlier pass already persisted if this round found nothing new — to generate and
 * persist Story relations. Runs inside the `entity.extract` job (ticket 14) now, so a genuine
 * failure (entity extraction, or the candidate-pool fetch above) is logged with stage context and
 * left to propagate rather than swallowed — that's what makes `pg-boss`'s retry policy do
 * anything. Per-candidate confirmation/persistence failures still degrade individually inside
 * `linkStoryRelations`, which never throws — one bad candidate must never sink the rest of the
 * shortlist.
 */
export async function extractEntitiesAndLinkStoryRelations(
  storyId: string,
  sourceTexts: string[],
  story: StoryForRelationPipeline,
  deps: EntityAndRelationPipelineDeps,
  log?: FastifyBaseLogger
): Promise<void> {
  await extractAndPersistStoryEntities(storyId, sourceTexts, deps.replaceStoryEntities, log)

  const { entities, entityRelations, rawCandidates, totalStories } = await fetchRelationCandidatePool(
    storyId,
    story.createdAt,
    deps,
    log
  )

  await linkStoryRelations(
    storyId,
    {
      anchorHeadline: story.anchorHeadline,
      createdAt: story.createdAt,
      eventTime: story.eventTime,
      embedding: story.embedding,
      entities,
      entityRelations,
    },
    rawCandidates,
    totalStories,
    { createStoryRelation: deps.createStoryRelation },
    log
  )
}
