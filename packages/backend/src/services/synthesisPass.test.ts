import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as llmClientModule from './llmClient.js'
import { runSynthesisPass, type SourceExtraction } from './synthesisPass.js'

vi.mock('./llmClient.js')

const EMPTY_EXTRACTION = {
  factualClaims: [],
  attributedClaims: [],
  interpretiveStatements: [],
  framingSignals: [],
}

const SOURCES: SourceExtraction[] = [
  {
    outlet: 'iDnes',
    articleUrl: 'https://idnes.cz/x',
    extraction: EMPTY_EXTRACTION,
    extractedText: 'Vláda dnes schválila rozpočet.',
  },
  {
    outlet: 'Novinky',
    articleUrl: 'https://novinky.cz/y',
    extraction: EMPTY_EXTRACTION,
    extractedText: 'Vláda schválila rozpočet, uvedla mluvčí.',
  },
]

describe('runSynthesisPass', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns the parsed synthesis when every attribution quote verifies, and never sends extractedText to the model', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({
      agreement: [
        {
          prose: 'Oba zdroje potvrzují schválení rozpočtu.',
          attributions: [
            {
              outlet: 'iDnes',
              czechQuote: 'Vláda dnes schválila rozpočet',
              articleUrl: 'https://idnes.cz/x',
            },
            { outlet: 'Novinky', czechQuote: 'Vláda schválila rozpočet', articleUrl: 'https://novinky.cz/y' },
          ],
        },
      ],
      contradiction: [],
      uniqueReporting: [],
      framing: [],
      agreementCategory: 'CONFIRMED',
    })

    const result = await runSynthesisPass(SOURCES)

    expect(result.agreement).toHaveLength(1)
    expect(result.agreementCategory).toBe('CONFIRMED')
    expect(llmClientModule.callJsonModel).toHaveBeenCalledTimes(1)
    const [, , userContent] = vi.mocked(llmClientModule.callJsonModel).mock.calls[0]
    expect(userContent).not.toContain('extractedText')
    expect(userContent).not.toContain('Vláda dnes schválila rozpočet.')
    expect(JSON.parse(userContent)).toEqual([
      { outlet: 'iDnes', articleUrl: 'https://idnes.cz/x', extraction: EMPTY_EXTRACTION },
      { outlet: 'Novinky', articleUrl: 'https://novinky.cz/y', extraction: EMPTY_EXTRACTION },
    ])
  })

  it('rejects a response whose agreementCategory is outside the closed enum, never coercing it', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({
      agreement: [],
      contradiction: [],
      uniqueReporting: [],
      framing: [],
      agreementCategory: 'MOSTLY_TRUE',
    })

    await expect(runSynthesisPass(SOURCES)).rejects.toThrow()
  })

  it('preserves agreementCategory through the repair loop — it is a story-level judgement, not derived from which items survive verification', async () => {
    vi.mocked(llmClientModule.callJsonModel)
      .mockResolvedValueOnce({
        agreement: [
          {
            prose: 'Oba zdroje potvrzují schválení rozpočtu.',
            attributions: [
              { outlet: 'iDnes', czechQuote: 'citát, který v článku není', articleUrl: 'https://idnes.cz/x' },
            ],
          },
        ],
        contradiction: [],
        uniqueReporting: [],
        framing: [],
        agreementCategory: 'DISPUTED',
      })
      .mockResolvedValueOnce({
        agreement: [
          {
            prose: 'Oba zdroje potvrzují schválení rozpočtu.',
            attributions: [
              {
                outlet: 'iDnes',
                czechQuote: 'Vláda dnes schválila rozpočet',
                articleUrl: 'https://idnes.cz/x',
              },
            ],
          },
        ],
        contradiction: [],
        uniqueReporting: [],
        framing: [],
        agreementCategory: 'DISPUTED',
      })

    const result = await runSynthesisPass(SOURCES)

    expect(result.agreement).toHaveLength(1)
    expect(result.agreementCategory).toBe('DISPUTED')
  })

  it('retries once and keeps the item when an attribution quote fails verification then passes', async () => {
    vi.mocked(llmClientModule.callJsonModel)
      .mockResolvedValueOnce({
        agreement: [
          {
            prose: 'Oba zdroje potvrzují schválení rozpočtu.',
            attributions: [
              { outlet: 'iDnes', czechQuote: 'citát, který v článku není', articleUrl: 'https://idnes.cz/x' },
            ],
          },
        ],
        contradiction: [],
        uniqueReporting: [],
        framing: [],
        agreementCategory: 'CONFIRMED',
      })
      .mockResolvedValueOnce({
        agreement: [
          {
            prose: 'Oba zdroje potvrzují schválení rozpočtu.',
            attributions: [
              {
                outlet: 'iDnes',
                czechQuote: 'Vláda dnes schválila rozpočet',
                articleUrl: 'https://idnes.cz/x',
              },
            ],
          },
        ],
        contradiction: [],
        uniqueReporting: [],
        framing: [],
        agreementCategory: 'CONFIRMED',
      })

    const result = await runSynthesisPass(SOURCES)

    expect(result.agreement).toHaveLength(1)
    expect(llmClientModule.callJsonModel).toHaveBeenCalledTimes(2)
  })

  it('drops the item when its attribution quote still fails verification after the retry', async () => {
    vi.mocked(llmClientModule.callJsonModel)
      .mockResolvedValueOnce({
        agreement: [
          {
            prose: 'Oba zdroje potvrzují schválení rozpočtu.',
            attributions: [
              { outlet: 'iDnes', czechQuote: 'citát, který v článku není', articleUrl: 'https://idnes.cz/x' },
            ],
          },
        ],
        contradiction: [],
        uniqueReporting: [],
        framing: [],
        agreementCategory: 'CONFIRMED',
      })
      .mockResolvedValueOnce({
        agreement: [
          {
            prose: 'Oba zdroje potvrzují schválení rozpočtu.',
            attributions: [
              { outlet: 'iDnes', czechQuote: 'stále vymyšlený citát', articleUrl: 'https://idnes.cz/x' },
            ],
          },
        ],
        contradiction: [],
        uniqueReporting: [],
        framing: [],
        agreementCategory: 'CONFIRMED',
      })

    const result = await runSynthesisPass(SOURCES)

    expect(result.agreement).toHaveLength(0)
    expect(result.agreementCategory).toBe('CONFIRMED')
    expect(llmClientModule.callJsonModel).toHaveBeenCalledTimes(2)
  })

  it('falls back to dropping the originally-failing item, without throwing or losing other items, when the repair response does not match the schema', async () => {
    vi.mocked(llmClientModule.callJsonModel)
      .mockResolvedValueOnce({
        agreement: [
          {
            prose: 'Oba zdroje potvrzují schválení rozpočtu.',
            attributions: [
              { outlet: 'iDnes', czechQuote: 'citát, který v článku není', articleUrl: 'https://idnes.cz/x' },
            ],
          },
        ],
        contradiction: [],
        uniqueReporting: [
          {
            prose: 'Pouze Novinky uvádí toto tvrzení.',
            attributions: [
              {
                outlet: 'Novinky',
                czechQuote: 'Vláda schválila rozpočet',
                articleUrl: 'https://novinky.cz/y',
              },
            ],
          },
        ],
        framing: [],
        agreementCategory: 'CONFIRMED',
      })
      // Malformed repair: a contradiction item with only one attribution instead of the two the
      // schema requires — simulates the model misunderstanding the repair instructions.
      .mockResolvedValueOnce({
        agreement: [],
        contradiction: [
          {
            prose: 'Neplatná oprava.',
            attributions: [{ outlet: 'iDnes', czechQuote: 'x', articleUrl: 'https://idnes.cz/x' }],
          },
        ],
        uniqueReporting: [],
        framing: [],
        agreementCategory: 'CONFIRMED',
      })

    const result = await runSynthesisPass(SOURCES)

    expect(result.agreement).toHaveLength(0)
    expect(result.uniqueReporting).toHaveLength(1)
    expect(result.uniqueReporting[0]?.prose).toBe('Pouze Novinky uvádí toto tvrzení.')
    expect(result.agreementCategory).toBe('CONFIRMED')
    expect(llmClientModule.callJsonModel).toHaveBeenCalledTimes(2)
  })

  it('drops a contradiction item that no longer has two valid attributions, never leaving it with one', async () => {
    vi.mocked(llmClientModule.callJsonModel)
      .mockResolvedValueOnce({
        agreement: [],
        contradiction: [
          {
            prose: 'Zdroje se neshodují na počtu obětí.',
            attributions: [
              {
                outlet: 'iDnes',
                czechQuote: 'Vláda dnes schválila rozpočet',
                articleUrl: 'https://idnes.cz/x',
              },
              {
                outlet: 'Novinky',
                czechQuote: 'citát, který v článku není',
                articleUrl: 'https://novinky.cz/y',
              },
            ],
          },
        ],
        uniqueReporting: [],
        framing: [],
        agreementCategory: 'CONFIRMED',
      })
      .mockResolvedValueOnce({
        agreement: [],
        contradiction: [
          {
            prose: 'Zdroje se neshodují na počtu obětí.',
            attributions: [
              {
                outlet: 'iDnes',
                czechQuote: 'Vláda dnes schválila rozpočet',
                articleUrl: 'https://idnes.cz/x',
              },
              { outlet: 'Novinky', czechQuote: 'stále vymyšlený citát', articleUrl: 'https://novinky.cz/y' },
            ],
          },
        ],
        uniqueReporting: [],
        framing: [],
        agreementCategory: 'CONFIRMED',
      })

    const result = await runSynthesisPass(SOURCES)

    expect(result.contradiction).toHaveLength(0)
  })
})
