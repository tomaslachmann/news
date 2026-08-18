import { openai } from './llmClient.js'
import { recordLlmCallSafe } from '../repositories/llmCallLog.js'

/** Every module that calls generateEmbedding — see ADR 0020. Extend this when a new caller is
 *  added. Distinct from llmClient.ts's LlmCallSite: embeddings and chat completions are
 *  structurally different calls sharing only the same log table, not the same caller set. */
export type EmbeddingCallSite = 'ingestion' | 'submissionDedup'

export async function generateEmbedding(text: string, callSite: EmbeddingCallSite): Promise<number[]> {
  const model = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small'
  // No system prompt for an embeddings call — null, not omitted, since LlmCallLog is shared with
  // callJsonModel's chat-completion shape (ADR 0020).
  const logBase = { callSite, model, systemPrompt: null, userContent: text }
  try {
    const response = await openai.embeddings.create({ model, input: text })
    const embedding = response.data[0]?.embedding
    // Must throw, not silently degrade to []: a caller that treats this as a successful (but
    // empty) embedding would create a Story that can never be matched again — cosineSimilarity
    // guards a zero-length vector to always score 0 — silently orphaning a real event instead of
    // hitting the caller's own skip-and-retry-next-poll path.
    if (!embedding) throw new Error('Embeddings API returned no embedding data')
    // The raw vector itself isn't logged (docs/audit.md P0-4): a 1536-float array has ~no
    // debugging value per byte next to the text prompts/responses this table otherwise holds.
    // Dimension count is still enough to confirm the call returned a shape consistent with the
    // configured model.
    await recordLlmCallSafe({
      ...logBase,
      responseContent: JSON.stringify({ dimensions: embedding.length }),
      error: null,
    })
    return embedding
  } catch (err) {
    await recordLlmCallSafe({
      ...logBase,
      responseContent: null,
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}
