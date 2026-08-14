import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as llmClientModule from './llmClient.js'
import {
  verifySameStory,
  verifySameStoryLogged,
  verifyCandidatesAgainstAnchor,
  verifyCandidatesAgainstAnchorInBatches,
} from './storyVerification.js'

vi.mock('./llmClient.js')

describe('verifySameStory', () => {
  beforeEach(() => vi.resetAllMocks())

  it('parses a same-event verdict from the LLM', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({
      sameEvent: true,
      reasoning: 'Both headlines describe the same detention.',
    })

    const result = await verifySameStory('Poland detains a man', 'Poland detains a Russian spy')

    expect(result).toEqual({ sameEvent: true, reasoning: 'Both headlines describe the same detention.' })
  })

  it('throws when the LLM response fails schema validation', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({ sameEvent: 'yes' })

    await expect(verifySameStory('A', 'B')).rejects.toThrow()
  })
})

describe('verifySameStoryLogged', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns the verdict on success', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({ sameEvent: true, reasoning: 'Same event.' })

    const result = await verifySameStoryLogged('A', 'B')

    expect(result).toEqual({ sameEvent: true, reasoning: 'Same event.' })
  })

  it('degrades to sameEvent: false instead of throwing when the LLM call fails', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockRejectedValue(new Error('rate limited'))

    const result = await verifySameStoryLogged('A', 'B')

    expect(result.sameEvent).toBe(false)
    expect(result.reasoning).toContain('rate limited')
  })

  it('degrades to sameEvent: false when the LLM response fails schema validation', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({ unexpected: 'shape' })

    const result = await verifySameStoryLogged('A', 'B')

    expect(result.sameEvent).toBe(false)
  })
})

describe('verifyCandidatesAgainstAnchor', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns only the candidates confirmed as the same event', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockImplementation((_model, _system, userContent) => {
      const sameEvent = userContent.includes('Candidate headline: Related')
      return Promise.resolve({ sameEvent, reasoning: 'stub' })
    })

    const candidates = [
      { title: 'Related', url: 'https://example.cz/related' },
      { title: 'Unrelated', url: 'https://example.cz/unrelated' },
    ]

    const result = await verifyCandidatesAgainstAnchor(candidates, 'Anchor story')

    expect(result).toEqual([{ title: 'Related', url: 'https://example.cz/related' }])
  })

  it('excludes a candidate whose verification call fails, without failing the whole batch', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockImplementation((_model, _system, userContent) => {
      if (userContent.includes('Candidate headline: Flaky')) {
        return Promise.reject(new Error('network error'))
      }
      return Promise.resolve({ sameEvent: true, reasoning: 'stub' })
    })

    const candidates = [
      { title: 'Fine', url: 'https://example.cz/fine' },
      { title: 'Flaky', url: 'https://example.cz/flaky' },
    ]

    const result = await verifyCandidatesAgainstAnchor(candidates, 'Anchor story')

    expect(result).toEqual([{ title: 'Fine', url: 'https://example.cz/fine' }])
  })

  it('returns an empty array without calling the LLM when there are no candidates', async () => {
    const result = await verifyCandidatesAgainstAnchor([], 'Anchor story')

    expect(result).toEqual([])
    expect(llmClientModule.callJsonModel).not.toHaveBeenCalled()
  })
})

describe('verifyCandidatesAgainstAnchorInBatches', () => {
  beforeEach(() => vi.resetAllMocks())

  it('verifies every candidate across multiple batches and preserves the confirmed ones', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockImplementation((_model, _system, userContent) => {
      const sameEvent = !userContent.includes('Candidate headline: Unrelated')
      return Promise.resolve({ sameEvent, reasoning: 'stub' })
    })

    const candidates = Array.from({ length: 5 }, (_, i) => ({ title: `Related ${i}`, url: `https://x/${i}` }))
    candidates.push({ title: 'Unrelated', url: 'https://x/unrelated' })

    const result = await verifyCandidatesAgainstAnchorInBatches(candidates, 'Anchor story', undefined, 2)

    expect(result).toHaveLength(5)
    expect(result.every((c) => c.title.startsWith('Related'))).toBe(true)
    expect(llmClientModule.callJsonModel).toHaveBeenCalledTimes(6)
  })

  it('never fans out more than batchSize calls at once', async () => {
    let concurrent = 0
    let maxConcurrent = 0
    vi.mocked(llmClientModule.callJsonModel).mockImplementation(async () => {
      concurrent++
      maxConcurrent = Math.max(maxConcurrent, concurrent)
      await new Promise((resolve) => setTimeout(resolve, 0))
      concurrent--
      return { sameEvent: true, reasoning: 'stub' }
    })

    const candidates = Array.from({ length: 9 }, (_, i) => ({ title: `T${i}`, url: `https://x/${i}` }))

    await verifyCandidatesAgainstAnchorInBatches(candidates, 'Anchor story', undefined, 3)

    expect(maxConcurrent).toBeLessThanOrEqual(3)
  })

  it('returns an empty array without calling the LLM when there are no candidates', async () => {
    const result = await verifyCandidatesAgainstAnchorInBatches([], 'Anchor story')

    expect(result).toEqual([])
    expect(llmClientModule.callJsonModel).not.toHaveBeenCalled()
  })
})
