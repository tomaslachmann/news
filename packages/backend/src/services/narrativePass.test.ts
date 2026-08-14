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

    const sources = [{ outlet: 'iDnes', articleUrl: 'https://idnes.cz/x', fullText: 'Plný text článku.' }]

    const result = await runNarrativePass(sources, EMPTY_DIMENSIONS)

    expect(result.segments).toHaveLength(1)
    expect(result.segments[0]?.prose).toBe('Oba deníky potvrdily, že k události došlo.')
    expect(llmClientModule.callJsonModel).toHaveBeenCalledWith(
      'gpt-4o',
      expect.any(String),
      JSON.stringify({ sources, dimensions: EMPTY_DIMENSIONS })
    )
  })

  it('throws when the LLM response does not match the expected schema', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({
      segments: [{ prose: 'missing attributions' }],
    })

    await expect(runNarrativePass([], EMPTY_DIMENSIONS)).rejects.toThrow()
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
