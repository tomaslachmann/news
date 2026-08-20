import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { FastifyBaseLogger } from 'fastify'
import { callJsonModel } from './llmClient.js'
import { deriveEntityKey } from './entityKey.js'
import {
  EntityTypeSchema,
  EntityRelationTypeSchema,
  type ExtractedEntity,
  type ExtractedEntityRelation,
} from './entityTypes.js'
import { runStageOrThrow } from './pipelineStage.js'

const SYSTEM_PROMPT = readFileSync(join(__dirname, '../prompts/entityExtraction.txt'), 'utf8')

const LlmResultSchema = z.object({
  entities: z.array(
    z.object({
      mention: z.string(),
      canonical_name: z.string(),
      type: EntityTypeSchema,
      confidence: z.number().min(0).max(1),
    })
  ),
  entityRelations: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      type: EntityRelationTypeSchema,
      confidence: z.number().min(0).max(1),
    })
  ),
})

export interface EntityExtractionResult {
  entities: ExtractedEntity[]
  entityRelations: ExtractedEntityRelation[]
}

// Ticket 11 / P1-14: a defensive ceiling, not a real chunking scheme — at today's actual volume
// (<=25 Coverage rows, MAX_COVERAGES_PER_ANALYSIS) this comfortably fits in gpt-4o's context
// window with room to spare, so there's no evidence an overflow ever actually happens. Throwing
// loudly here beats either a silent truncation (losing entities from whichever text got cut) or
// a real multi-call chunking scheme, which would need to solve replaceStoryEntities's whole-
// Story-replace-per-call semantics (see repositories/entity.ts) for a risk that's speculative at
// current volume. Exported so entityRelationJob.ts can pre-check the same budget before entering
// the pipeline at all — this is a permanent, non-retryable condition (the same pinned Coverage
// set produces the same total length on every retry), so the job handler treats it like its own
// "Analysis no longer exists" case (log + skip) rather than let it burn the job's retry budget on
// a guaranteed-to-fail-identically retry. This function's own throw stays as a correctness
// backstop for any other caller.
export const MAX_TOTAL_INPUT_CHARS = 200_000

/**
 * Extracts a lightweight, Story-scoped entity + entity-relation signal from whatever source text
 * is available for a Story (RSS titles for an Ingestion-originated Draft, confirmed Coverage's
 * full extracted text for a human-seeded submission — see ticket 34). Not a knowledge graph and
 * not verified real-world identity: `key` is a deterministic label derived from the model's own
 * name normalization, computed here rather than by the model itself so the same real-world
 * entity always produces the same key regardless of which call extracted it.
 *
 * Returns an empty result (skipping the LLM call) when there's no source text at all. A thrown
 * error is not caught here — its only caller, extractAndPersistStoryEntities below, logs it with
 * stage context and rethrows via runStageOrThrow so it propagates out of the `entity.extract` job
 * (ticket 14) and pg-boss's retry policy actually retries it; this function's own contract is
 * "extract or throw," matching every other pass.
 */
export async function runEntityExtractionPass(
  sourceTexts: string[],
  log?: FastifyBaseLogger
): Promise<EntityExtractionResult> {
  if (sourceTexts.length === 0) return { entities: [], entityRelations: [] }

  const totalChars = sourceTexts.reduce((sum, t) => sum + t.length, 0)
  if (totalChars > MAX_TOTAL_INPUT_CHARS) {
    throw new Error(
      `Entity extraction input too large: ${totalChars} chars across ${sourceTexts.length} texts ` +
        `(budget ${MAX_TOTAL_INPUT_CHARS})`
    )
  }

  const model = process.env.ENTITY_MODEL ?? 'gpt-4o'
  const userContent = JSON.stringify(sourceTexts)
  const parsed = LlmResultSchema.parse(
    await callJsonModel(model, SYSTEM_PROMPT, userContent, 'entityExtraction')
  )

  // Deduped by derived key, not just pushed as-is — the model can (and does) re-mention the same
  // entity more than once across the input texts; keeping every mention as its own row would let
  // Story.entities silently accumulate duplicate rows sharing one key.
  const entityByKey = new Map<string, ExtractedEntity>()
  for (const e of parsed.entities) {
    const key = deriveEntityKey(e.type, e.canonical_name)
    if (!entityByKey.has(key)) {
      entityByKey.set(key, { key, name: e.canonical_name, type: e.type, confidence: e.confidence })
    }
  }
  const entities = [...entityByKey.values()]

  // A canonical_name alone can be ambiguous — two distinct entities of different types (a PLACE
  // and a PERSON both named "Washington") derive different keys but share the same name string.
  // Track every key a name maps to; a relation is only resolved when its from/to name maps to
  // exactly one key. An ambiguous or unknown name is dropped, never silently resolved to the
  // wrong entity — matching this pipeline's rule that unverifiable content is excluded, not kept.
  const keysByName = new Map<string, Set<string>>()
  for (const e of entities) {
    const keys = keysByName.get(e.name) ?? new Set<string>()
    keys.add(e.key)
    keysByName.set(e.name, keys)
  }
  const resolveKey = (name: string): string | null => {
    const keys = keysByName.get(name)
    if (!keys || keys.size !== 1) return null
    const [onlyKey] = keys
    return onlyKey
  }

  const entityRelations: ExtractedEntityRelation[] = []
  for (const r of parsed.entityRelations) {
    const from = resolveKey(r.from)
    const to = resolveKey(r.to)
    if (!from || !to) {
      log?.warn({ relation: r }, 'Dropping entityRelation referencing an unknown or ambiguous entity name')
      continue
    }
    // A self-relation (from and to resolving to the same entity) violates
    // StoryEntityRelation's no_self_relation CHECK constraint — dropped here, before
    // persistence, rather than letting the DB reject it and roll back the whole extraction.
    if (from === to) {
      log?.warn({ relation: r }, 'Dropping entityRelation whose from/to resolve to the same entity')
      continue
    }
    entityRelations.push({ from, to, type: r.type, confidence: r.confidence })
  }

  return { entities, entityRelations }
}

/** Extracts entities/entityRelations for a Story and persists them. "Nothing extracted" (no
 *  source texts, or the model found no entities) is not an error — it returns null rather than
 *  clobbering whatever a previous, more successful pass already persisted for this Story. A
 *  genuine failure (LLM call error, persistence error) is logged with stage context and rethrown
 *  as `ExternalServiceError` rather than swallowed — this runs inside the `entity.extract` job
 *  (ticket 14) now, where a thrown error is what makes `pg-boss`'s retry policy do anything;
 *  swallowing it here would make that retry policy dead code (see pipelineStage.ts). Takes
 *  `replaceStoryEntities` as a dependency rather than importing the repository directly, keeping
 *  this pass module decoupled from persistence and easy to unit-test without mocking the
 *  repository layer.
 *
 *  Returns what was persisted (or null if nothing was extracted) so a caller that immediately
 *  needs this Story's own entities/entityRelations — ticket 35's relation-candidate scoring —
 *  doesn't have to re-fetch the Story it was just written to. */
export async function extractAndPersistStoryEntities(
  storyId: string,
  sourceTexts: string[],
  replaceStoryEntities: (
    storyId: string,
    entities: ExtractedEntity[],
    entityRelations: ExtractedEntityRelation[]
  ) => Promise<void>,
  log?: FastifyBaseLogger
): Promise<EntityExtractionResult | null> {
  const extraction = await runStageOrThrow({ storyId }, 'Entity extraction', log, () =>
    runEntityExtractionPass(sourceTexts, log)
  )

  // Nothing extracted is not the same as "clear whatever was there before" — e.g. a Review Step
  // confirmation call that ends up with no OK Coverage this round must not wipe out a Story's
  // previously-extracted entities from an earlier, more successful pass. Logged at info, not
  // warn/error — a thin or off-topic source producing zero entities isn't a failure, just worth
  // being visible in logs rather than silently invisible.
  if (extraction.entities.length === 0) {
    log?.info({ storyId, sourceTextCount: sourceTexts.length }, 'No entities extracted for this Story')
    return null
  }

  await runStageOrThrow({ storyId }, 'Persisting extracted entities', log, () =>
    replaceStoryEntities(storyId, extraction.entities, extraction.entityRelations)
  )
  return extraction
}
