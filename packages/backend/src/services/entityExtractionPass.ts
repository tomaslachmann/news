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

/**
 * Extracts a lightweight, Story-scoped entity + entity-relation signal from whatever source text
 * is available for a Story (RSS titles for an Ingestion-originated Draft, confirmed Coverage's
 * full extracted text for a human-seeded submission — see ticket 34). Not a knowledge graph and
 * not verified real-world identity: `key` is a deterministic label derived from the model's own
 * name normalization, computed here rather than by the model itself so the same real-world
 * entity always produces the same key regardless of which call extracted it.
 *
 * Returns an empty result (skipping the LLM call) when there's no source text at all. A thrown
 * error is not caught here — callers (approveDraft, confirmCoverages) degrade gracefully on
 * failure themselves; this function's contract is "extract or throw," matching every other pass.
 */
export async function runEntityExtractionPass(
  sourceTexts: string[],
  log?: FastifyBaseLogger
): Promise<EntityExtractionResult> {
  if (sourceTexts.length === 0) return { entities: [], entityRelations: [] }

  const model = process.env.EXTRACTION_MODEL ?? 'gpt-4o'
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
    entityRelations.push({ from, to, type: r.type, confidence: r.confidence })
  }

  return { entities, entityRelations }
}

/** Extracts entities/entityRelations for a Story and persists them, degrading gracefully on any
 *  failure (LLM error, or nothing extracted) rather than throwing or clobbering prior data.
 *  Shared by both pipeline trigger points (approveDraft, confirmCoverages — ticket 34) so the
 *  try/catch and empty-result guard live in exactly one place. Takes `updateStoryEntities` as a
 *  dependency rather than importing the repository directly, keeping this pass module decoupled
 *  from persistence and easy to unit-test without mocking the repository layer.
 *
 *  Returns what was persisted (or null if extraction failed or produced nothing) so a caller that
 *  immediately needs this Story's own entities/entityRelations — ticket 35's relation-candidate
 *  scoring — doesn't have to re-fetch the Story it was just written to. */
export async function extractAndPersistStoryEntities(
  storyId: string,
  sourceTexts: string[],
  updateStoryEntities: (storyId: string, entities: unknown, entityRelations: unknown) => Promise<void>,
  log?: FastifyBaseLogger
): Promise<EntityExtractionResult | null> {
  try {
    const extraction = await runEntityExtractionPass(sourceTexts, log)
    // Nothing extracted is not the same as "clear whatever was there before" — e.g. a Review Step
    // confirmation call that ends up with no OK Coverage this round must not wipe out a Story's
    // previously-extracted entities from an earlier, more successful pass.
    if (extraction.entities.length === 0) return null
    await updateStoryEntities(storyId, extraction.entities, extraction.entityRelations)
    return extraction
  } catch (err) {
    log?.warn({ storyId, err }, 'Entity extraction failed; leaving Story.entities/entityRelations unchanged')
    return null
  }
}
