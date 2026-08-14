import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('openai', () => ({
  default: class {
    embeddings = { create: mockCreate }
  },
}))

import { generateEmbedding } from './embeddingClient.js'

describe('generateEmbedding', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  it('sends the text to the embeddings API and returns the vector', async () => {
    mockCreate.mockResolvedValue({ data: [{ embedding: [0.1, 0.2, 0.3], index: 0, object: 'embedding' }] })

    const result = await generateEmbedding('Headline text')

    expect(result).toEqual([0.1, 0.2, 0.3])
    expect(mockCreate).toHaveBeenCalledWith({ model: 'text-embedding-3-small', input: 'Headline text' })
  })

  it('throws, rather than silently returning an empty vector, when the response has no embedding data', async () => {
    // A silently-empty embedding would let the caller create a Story that can never be matched
    // again instead of hitting its own skip-and-retry-next-poll path — must throw instead.
    mockCreate.mockResolvedValue({ data: [] })

    await expect(generateEmbedding('Headline text')).rejects.toThrow('no embedding data')
  })
})
