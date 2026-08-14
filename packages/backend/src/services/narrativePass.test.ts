import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as llmClientModule from './llmClient.js'
import { runNarrativePass, NarrativeResultSchema } from './narrativePass.js'
import type { SynthesisResult } from './synthesisPass.js'

vi.mock('./llmClient.js')

const EMPTY_DIMENSIONS: SynthesisResult = {
  agreement: [],
  contradiction: [],
  uniqueReporting: [],
  framing: [],
}

const SOURCES = [
  { outlet: 'iDnes', articleUrl: 'https://idnes.cz/x', fullText: 'Plný text článku. Událost se stala.' },
]

describe('runNarrativePass', () => {
  beforeEach(() => vi.resetAllMocks())

  it('sends the sources and dimensions to the LLM and returns the parsed narrative', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({
      segments: [
        {
          prose: 'Oba deníky potvrdily, že k události došlo.',
          attributions: [
            { outlet: 'iDnes', czechQuote: 'Událost se stala', articleUrl: 'https://idnes.cz/x' },
          ],
        },
      ],
    })

    const result = await runNarrativePass(SOURCES, EMPTY_DIMENSIONS)

    expect(result.segments).toHaveLength(1)
    expect(result.segments[0]?.prose).toBe('Oba deníky potvrdily, že k události došlo.')
    expect(llmClientModule.callJsonModel).toHaveBeenCalledWith(
      'gpt-4o',
      expect.any(String),
      JSON.stringify({ sources: SOURCES, dimensions: EMPTY_DIMENSIONS })
    )
  })

  it('throws when the LLM response does not match the expected schema', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({
      segments: [{ prose: 'missing attributions' }],
    })

    await expect(runNarrativePass([], EMPTY_DIMENSIONS)).rejects.toThrow()
  })

  it('retries once and returns the corrected segment when a quote fails verification then passes', async () => {
    vi.mocked(llmClientModule.callJsonModel)
      .mockResolvedValueOnce({
        segments: [
          {
            prose: 'Tvrzení s vymyšleným citátem.',
            attributions: [
              { outlet: 'iDnes', czechQuote: 'citát, který v článku není', articleUrl: 'https://idnes.cz/x' },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        segments: [
          {
            prose: 'Tvrzení s vymyšleným citátem.',
            attributions: [
              { outlet: 'iDnes', czechQuote: 'Událost se stala', articleUrl: 'https://idnes.cz/x' },
            ],
          },
        ],
      })

    const result = await runNarrativePass(SOURCES, EMPTY_DIMENSIONS)

    expect(result.segments).toHaveLength(1)
    expect(result.segments[0]?.attributions[0]?.czechQuote).toBe('Událost se stala')
    expect(llmClientModule.callJsonModel).toHaveBeenCalledTimes(2)
  })

  it('drops a segment whose quote still fails verification after the retry', async () => {
    vi.mocked(llmClientModule.callJsonModel)
      .mockResolvedValueOnce({
        segments: [
          {
            prose: 'Tvrzení s vymyšleným citátem.',
            attributions: [
              { outlet: 'iDnes', czechQuote: 'citát, který v článku není', articleUrl: 'https://idnes.cz/x' },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        segments: [
          {
            prose: 'Tvrzení s vymyšleným citátem.',
            attributions: [
              { outlet: 'iDnes', czechQuote: 'stále vymyšlený citát', articleUrl: 'https://idnes.cz/x' },
            ],
          },
        ],
      })

    const result = await runNarrativePass(SOURCES, EMPTY_DIMENSIONS)

    expect(result.segments).toHaveLength(0)
    expect(llmClientModule.callJsonModel).toHaveBeenCalledTimes(2)
  })
})

describe('NarrativeResultSchema', () => {
  it('requires at least one attribution per segment', () => {
    const result = NarrativeResultSchema.safeParse({ segments: [{ prose: 'text', attributions: [] }] })
    expect(result.success).toBe(false)
  })

  it('requires at least one segment', () => {
    const result = NarrativeResultSchema.safeParse({ segments: [] })
    expect(result.success).toBe(false)
  })
})
