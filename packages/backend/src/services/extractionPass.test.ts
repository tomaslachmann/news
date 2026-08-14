import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as llmClientModule from './llmClient.js'
import { runExtractionPass } from './extractionPass.js'

vi.mock('./llmClient.js')

const ARTICLE_TEXT = 'Vláda dnes schválila rozpočet. Ministr financí řekl, že jde o vyrovnaný návrh.'

describe('runExtractionPass', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns the parsed extraction when every quote verifies on the first try', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({
      factualClaims: [{ claim: 'Vláda schválila rozpočet', czechQuote: 'Vláda dnes schválila rozpočet' }],
      attributedClaims: [],
      interpretiveStatements: [],
      framingSignals: [],
    })

    const result = await runExtractionPass(ARTICLE_TEXT)

    expect(result.factualClaims).toHaveLength(1)
    expect(llmClientModule.callJsonModel).toHaveBeenCalledTimes(1)
    expect(llmClientModule.callJsonModel).toHaveBeenCalledWith('gpt-4o', expect.any(String), ARTICLE_TEXT)
  })

  it('retries once and keeps the claim when a quote fails verification then passes', async () => {
    vi.mocked(llmClientModule.callJsonModel)
      .mockResolvedValueOnce({
        factualClaims: [{ claim: 'Vláda schválila rozpočet', czechQuote: 'citát, který v článku není' }],
        attributedClaims: [],
        interpretiveStatements: [],
        framingSignals: [],
      })
      .mockResolvedValueOnce({
        factualClaims: [{ claim: 'Vláda schválila rozpočet', czechQuote: 'Vláda dnes schválila rozpočet' }],
        attributedClaims: [],
        interpretiveStatements: [],
        framingSignals: [],
      })

    const result = await runExtractionPass(ARTICLE_TEXT)

    expect(result.factualClaims).toHaveLength(1)
    expect(result.factualClaims[0]?.czechQuote).toBe('Vláda dnes schválila rozpočet')
    expect(llmClientModule.callJsonModel).toHaveBeenCalledTimes(2)
  })

  it('drops the claim when its quote still fails verification after the retry', async () => {
    vi.mocked(llmClientModule.callJsonModel)
      .mockResolvedValueOnce({
        factualClaims: [{ claim: 'Vláda schválila rozpočet', czechQuote: 'citát, který v článku není' }],
        attributedClaims: [
          { speaker: 'Ministr', statement: 'jde o vyrovnaný návrh', czechQuote: 'jde o vyrovnaný návrh' },
        ],
        interpretiveStatements: [],
        framingSignals: [],
      })
      .mockResolvedValueOnce({
        factualClaims: [{ claim: 'Vláda schválila rozpočet', czechQuote: 'stále vymyšlený citát' }],
        attributedClaims: [
          { speaker: 'Ministr', statement: 'jde o vyrovnaný návrh', czechQuote: 'jde o vyrovnaný návrh' },
        ],
        interpretiveStatements: [],
        framingSignals: [],
      })

    const result = await runExtractionPass(ARTICLE_TEXT)

    expect(result.factualClaims).toHaveLength(0)
    expect(result.attributedClaims).toHaveLength(1)
    expect(llmClientModule.callJsonModel).toHaveBeenCalledTimes(2)
  })
})
