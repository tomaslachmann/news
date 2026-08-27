import { createHash } from 'node:crypto'
import { openai } from './llmClient.js'
import { recordLlmCallSafe } from '../repositories/llmCallLog.js'
import { findCachedEmbedding, saveCachedEmbedding } from '../repositories/embeddingCache.js'
import { createLogger } from '../logger.js'

const log = createLogger('embedding')

/** Every module that calls generateEmbedding — see ADR 0020. Extend this when a new caller is
 *  added. Distinct from llmClient.ts's LlmCallSite: embeddings and chat completions are
 *  structurally different calls sharing only the same log table, not the same caller set. */
export type EmbeddingCallSite = 'ingestion' | 'submissionDedup'

export interface EmbeddingResult {
  vector: number[]
  /** The EMBEDDING_MODEL that actually produced `vector` — for a caller that wants to persist
   *  Story.embeddingModel (ADR 0025, P1-8). */
  model: string
  /** sha256 of `${model}::${text}` — the same value EmbeddingCache is keyed on, for a caller
   *  that wants to persist Story.embeddingInputHash. */
  inputHash: string
}

function hashInput(model: string, text: string): string {
  return createHash('sha256').update(`${model}::${text}`).digest('hex')
}

/**
 * Generates (or reuses) an embedding for `text`. Checks EmbeddingCache first, keyed on
 * (model, sha256(model::text)) — a hit returns the cached vector without calling the embeddings
 * API and without writing an LlmCallLog row (no call happened; see ADR 0025 and ADR 0020's own
 * definition of that table). A miss behaves exactly as before this ticket (API call, LlmCallLog
 * row on success or failure) and additionally writes the result into EmbeddingCache. Cache
 * read/write failures degrade to "treat as a miss" / "skip the write" respectively — the cache
 * is a pure optimization, never something correctness depends on.
 */
export async function generateEmbedding(text: string, callSite: EmbeddingCallSite): Promise<EmbeddingResult> {
  const model = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small'
  const inputHash = hashInput(model, text)

  try {
    const cached = await findCachedEmbedding(model, inputHash)
    if (cached) {
      log.info({ callSite, model }, 'Embedding cache hit')
      return { vector: cached, model, inputHash }
    }
  } catch (err) {
    log.error({ callSite, model, err }, 'EmbeddingCache lookup failed; falling back to the embeddings API')
  }

  // No system prompt for an embeddings call — null, not omitted, since LlmCallLog is shared with
  // callJsonModel's chat-completion shape (ADR 0020).
  const logBase = { callSite, model, systemPrompt: null, userContent: text }
  log.info({ callSite, model }, 'Embedding cache miss, calling the embeddings API')
  try {
    const response = await openai.embeddings.create({ model, input: text })
    const embedding = response.data[0]?.embedding
    // Must throw, not silently degrade to []: a caller that treats this as a successful (but
    // empty) embedding would create a Story that can never be matched again — cosineSimilarity
    // guards a zero-length vector to always score 0 — silently orphaning a real event instead of
    // hitting the caller's own skip-and-retry-next-poll path.
    if (!embedding) throw new Error('Embeddings API returned no embedding data')
    // The raw vector itself isn't logged here (docs/audit.md P0-4): a 1536-float array has ~no
    // debugging value per byte next to the text prompts/responses this table otherwise holds.
    // Dimension count is still enough to confirm the call returned a shape consistent with the
    // configured model. (EmbeddingCache, below, is where the actual vector is kept for reuse.)
    await recordLlmCallSafe({
      ...logBase,
      responseContent: JSON.stringify({ dimensions: embedding.length }),
      error: null,
    })
    try {
      await saveCachedEmbedding(model, inputHash, embedding)
    } catch (err) {
      log.error({ callSite, model, err }, 'Failed to write EmbeddingCache entry')
    }
    log.info({ callSite, model, dimensions: embedding.length }, 'Embedding generated')
    return { vector: embedding, model, inputHash }
  } catch (err) {
    await recordLlmCallSafe({
      ...logBase,
      responseContent: null,
      error: err instanceof Error ? err.message : String(err),
    })
    log.error({ callSite, model, err }, 'Embedding generation failed')
    throw err
  }
}
