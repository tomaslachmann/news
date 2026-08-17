import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as llmClientModule from './llmClient.js'
import { extractKeywords } from './keywordExtractor.js'

vi.mock('./llmClient.js')

describe('extractKeywords', () => {
  beforeEach(() => vi.resetAllMocks())

  it('calls callJsonModel with the title/excerpt and its own temperature, returning the parsed keywords', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({
      keywords: ['vláda', 'rozpočet'],
    })

    const result = await extractKeywords('Vláda schválila rozpočet', 'Vláda dnes schválila státní rozpočet.')

    expect(result).toEqual(['vláda', 'rozpočet'])
    expect(llmClientModule.callJsonModel).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('novinářský asistent'),
      'Titulek: Vláda schválila rozpočet\n\nVláda dnes schválila státní rozpočet.',
      0.2
    )
  })

  it('trims whitespace, drops empty/non-string entries, and caps at 5 keywords', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({
      keywords: [' a ', '', 'b', 42, 'c', 'd', 'e', 'f'],
    })

    const result = await extractKeywords('Title', 'Excerpt')

    expect(result).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('throws when the response has no keywords array', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({})

    await expect(extractKeywords('Title', 'Excerpt')).rejects.toThrow(
      'Unexpected response shape from keyword extraction model'
    )
  })
})
