import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as llmClientModule from './llmClient.js'
import { runHeadlinePass } from './headlinePass.js'
import type { SynthesisResult } from './synthesisPass.js'

vi.mock('./llmClient.js')

const AGREEMENT: SynthesisResult['agreement'] = [
  {
    id: 'i1',
    prose: 'Vláda dnes schválila státní rozpočet.',
    attributions: [
      { outlet: 'iDnes', czechQuote: 'Vláda dnes schválila rozpočet', articleUrl: 'https://idnes.cz/x' },
    ],
  },
]

describe('runHeadlinePass', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns null without calling the model when the Agreement dimension is empty', async () => {
    const result = await runHeadlinePass([])

    expect(result).toBeNull()
    expect(llmClientModule.callJsonModel).not.toHaveBeenCalled()
  })

  it('calls callJsonModel with only the Agreement prose, tagged with the headline callSite, and returns the headline', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({ headline: 'Vláda schválila rozpočet' })

    const result = await runHeadlinePass(AGREEMENT)

    expect(result).toBe('Vláda schválila rozpočet')
    const [model, systemPrompt, userContent, callSite] = vi.mocked(llmClientModule.callJsonModel).mock
      .calls[0]
    expect(typeof model).toBe('string')
    expect(typeof systemPrompt).toBe('string')
    expect(callSite).toBe('headline')
    // Only Agreement prose goes in — no attributions/quotes, no other dimension's content.
    expect(JSON.parse(userContent)).toEqual(['Vláda dnes schválila státní rozpočet.'])
  })

  it('propagates a thrown error rather than swallowing it', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockRejectedValue(new Error('API down'))

    await expect(runHeadlinePass(AGREEMENT)).rejects.toThrow('API down')
  })

  it('throws when the response does not match the expected schema', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({ notAHeadline: 'x' })

    await expect(runHeadlinePass(AGREEMENT)).rejects.toThrow()
  })
})
