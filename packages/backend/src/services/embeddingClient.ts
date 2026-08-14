import { openai } from './llmClient.js'

export async function generateEmbedding(text: string): Promise<number[]> {
  const model = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small'
  const response = await openai.embeddings.create({ model, input: text })
  const embedding = response.data[0]?.embedding
  // Must throw, not silently degrade to []: a caller that treats this as a successful (but
  // empty) embedding would create a Story that can never be matched again — cosineSimilarity
  // guards a zero-length vector to always score 0 — silently orphaning a real event instead of
  // hitting the caller's own skip-and-retry-next-poll path.
  if (!embedding) throw new Error('Embeddings API returned no embedding data')
  return embedding
}
