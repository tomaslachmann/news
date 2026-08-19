import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as llmCallLogRepo from '../repositories/llmCallLog.js'
import * as embeddingCacheRepo from '../repositories/embeddingCache.js'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('openai', () => ({
  default: class {
    embeddings = { create: mockCreate }
  },
}))
vi.mock('../repositories/llmCallLog.js')
vi.mock('../repositories/embeddingCache.js')

import { generateEmbedding } from './embeddingClient.js'

describe('generateEmbedding', () => {
  beforeEach(() => {
    mockCreate.mockReset()
    vi.mocked(llmCallLogRepo.recordLlmCallSafe).mockReset().mockResolvedValue(undefined)
    vi.mocked(embeddingCacheRepo.findCachedEmbedding).mockReset().mockResolvedValue(null)
    vi.mocked(embeddingCacheRepo.saveCachedEmbedding).mockReset().mockResolvedValue(undefined)
  })

  it('sends the text to the embeddings API and returns { vector, model, inputHash } on a cache miss', async () => {
    mockCreate.mockResolvedValue({ data: [{ embedding: [0.1, 0.2, 0.3], index: 0, object: 'embedding' }] })

    const result = await generateEmbedding('Headline text', 'ingestion')

    expect(result.vector).toEqual([0.1, 0.2, 0.3])
    expect(result.model).toBe('text-embedding-3-small')
    expect(typeof result.inputHash).toBe('string')
    expect(result.inputHash).toHaveLength(64) // sha256 hex digest
    expect(mockCreate).toHaveBeenCalledWith({ model: 'text-embedding-3-small', input: 'Headline text' })
  })

  it('produces the same inputHash for the same model+text, and a different one for different text', async () => {
    mockCreate.mockResolvedValue({ data: [{ embedding: [0.1, 0.2, 0.3], index: 0, object: 'embedding' }] })

    const a = await generateEmbedding('Same text', 'ingestion')
    const b = await generateEmbedding('Same text', 'ingestion')
    const c = await generateEmbedding('Different text', 'ingestion')

    expect(a.inputHash).toBe(b.inputHash)
    expect(a.inputHash).not.toBe(c.inputHash)
  })

  it('checks EmbeddingCache before calling the API, keyed on the resolved model and computed inputHash', async () => {
    mockCreate.mockResolvedValue({ data: [{ embedding: [0.1, 0.2, 0.3], index: 0, object: 'embedding' }] })

    const result = await generateEmbedding('Headline text', 'ingestion')

    expect(embeddingCacheRepo.findCachedEmbedding).toHaveBeenCalledWith(
      'text-embedding-3-small',
      result.inputHash
    )
  })

  it('on a cache hit: returns the cached vector without calling the embeddings API or writing LlmCallLog', async () => {
    vi.mocked(embeddingCacheRepo.findCachedEmbedding).mockResolvedValue([9, 9, 9])

    const result = await generateEmbedding('Headline text', 'ingestion')

    expect(result.vector).toEqual([9, 9, 9])
    expect(mockCreate).not.toHaveBeenCalled()
    expect(llmCallLogRepo.recordLlmCallSafe).not.toHaveBeenCalled()
  })

  it('on a cache miss: writes the new vector into EmbeddingCache after a successful call', async () => {
    mockCreate.mockResolvedValue({ data: [{ embedding: [0.1, 0.2, 0.3], index: 0, object: 'embedding' }] })

    const result = await generateEmbedding('Headline text', 'ingestion')

    expect(embeddingCacheRepo.saveCachedEmbedding).toHaveBeenCalledWith(
      'text-embedding-3-small',
      result.inputHash,
      [0.1, 0.2, 0.3]
    )
  })

  it('falls back to calling the API when the cache lookup itself fails, rather than throwing', async () => {
    vi.mocked(embeddingCacheRepo.findCachedEmbedding).mockRejectedValue(new Error('DB down'))
    mockCreate.mockResolvedValue({ data: [{ embedding: [0.1, 0.2, 0.3], index: 0, object: 'embedding' }] })

    const result = await generateEmbedding('Headline text', 'ingestion')

    expect(result.vector).toEqual([0.1, 0.2, 0.3])
    expect(mockCreate).toHaveBeenCalled()
  })

  it('does not fail the call when writing the cache entry itself fails', async () => {
    vi.mocked(embeddingCacheRepo.saveCachedEmbedding).mockRejectedValue(new Error('DB down'))
    mockCreate.mockResolvedValue({ data: [{ embedding: [0.1, 0.2, 0.3], index: 0, object: 'embedding' }] })

    await expect(generateEmbedding('Headline text', 'ingestion')).resolves.toMatchObject({
      vector: [0.1, 0.2, 0.3],
    })
  })

  it('throws, rather than silently returning an empty vector, when the response has no embedding data', async () => {
    // A silently-empty embedding would let the caller create a Story that can never be matched
    // again instead of hitting its own skip-and-retry-next-poll path — must throw instead.
    mockCreate.mockResolvedValue({ data: [] })

    await expect(generateEmbedding('Headline text', 'ingestion')).rejects.toThrow('no embedding data')
  })

  it("records a successful call with the input text and callSite, logging the vector's dimension count rather than the vector itself", async () => {
    // P0-4 (docs/audit.md): a raw 1536-float vector has ~no debugging value per byte compared to
    // text prompts/responses, so it's excluded from what this table stores — dimension count is
    // still enough to confirm the call returned a shape consistent with the configured model.
    mockCreate.mockResolvedValue({ data: [{ embedding: [0.1, 0.2], index: 0, object: 'embedding' }] })

    await generateEmbedding('Headline text', 'submissionDedup')

    expect(llmCallLogRepo.recordLlmCallSafe).toHaveBeenCalledWith({
      callSite: 'submissionDedup',
      model: 'text-embedding-3-small',
      systemPrompt: null,
      userContent: 'Headline text',
      responseContent: JSON.stringify({ dimensions: 2 }),
      error: null,
    })
  })

  it('records a failed call and still rethrows when the embeddings API itself throws', async () => {
    mockCreate.mockRejectedValue(new Error('API down'))

    await expect(generateEmbedding('Headline text', 'ingestion')).rejects.toThrow('API down')

    expect(llmCallLogRepo.recordLlmCallSafe).toHaveBeenCalledWith({
      callSite: 'ingestion',
      model: 'text-embedding-3-small',
      systemPrompt: null,
      userContent: 'Headline text',
      responseContent: null,
      error: 'API down',
    })
  })

  it('records a failed call when the response has no embedding data', async () => {
    mockCreate.mockResolvedValue({ data: [] })

    await expect(generateEmbedding('Headline text', 'ingestion')).rejects.toThrow()

    expect(llmCallLogRepo.recordLlmCallSafe).toHaveBeenCalledWith(
      expect.objectContaining({ callSite: 'ingestion', responseContent: null })
    )
  })
})
