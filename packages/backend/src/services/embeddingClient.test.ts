import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as llmCallLogRepo from '../repositories/llmCallLog.js'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('openai', () => ({
  default: class {
    embeddings = { create: mockCreate }
  },
}))
vi.mock('../repositories/llmCallLog.js')

import { generateEmbedding } from './embeddingClient.js'

describe('generateEmbedding', () => {
  beforeEach(() => {
    mockCreate.mockReset()
    vi.mocked(llmCallLogRepo.recordLlmCallSafe).mockReset().mockResolvedValue(undefined)
  })

  it('sends the text to the embeddings API and returns the vector', async () => {
    mockCreate.mockResolvedValue({ data: [{ embedding: [0.1, 0.2, 0.3], index: 0, object: 'embedding' }] })

    const result = await generateEmbedding('Headline text', 'ingestion')

    expect(result).toEqual([0.1, 0.2, 0.3])
    expect(mockCreate).toHaveBeenCalledWith({ model: 'text-embedding-3-small', input: 'Headline text' })
  })

  it('throws, rather than silently returning an empty vector, when the response has no embedding data', async () => {
    // A silently-empty embedding would let the caller create a Story that can never be matched
    // again instead of hitting its own skip-and-retry-next-poll path — must throw instead.
    mockCreate.mockResolvedValue({ data: [] })

    await expect(generateEmbedding('Headline text', 'ingestion')).rejects.toThrow('no embedding data')
  })

  it('records a successful call with the input text, serialized embedding, and callSite', async () => {
    mockCreate.mockResolvedValue({ data: [{ embedding: [0.1, 0.2], index: 0, object: 'embedding' }] })

    await generateEmbedding('Headline text', 'submissionDedup')

    expect(llmCallLogRepo.recordLlmCallSafe).toHaveBeenCalledWith({
      callSite: 'submissionDedup',
      model: 'text-embedding-3-small',
      systemPrompt: null,
      userContent: 'Headline text',
      responseContent: JSON.stringify([0.1, 0.2]),
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
