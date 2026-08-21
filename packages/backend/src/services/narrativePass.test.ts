import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as llmClientModule from './llmClient.js'
import { runNarrativePass, type NarrativeDimensions, type KnownEntity } from './narrativePass.js'
import { NarrativeVerificationError } from './narrativeDocument.js'

vi.mock('./llmClient.js')

const dim = (id: string, prose: string, articleUrl: string) => ({
  id,
  prose,
  attributions: [{ outlet: 'iDnes', czechQuote: 'Událost se stala', articleUrl }],
})

const DIMENSIONS: NarrativeDimensions = {
  agreement: [dim('d1', 'Obě strany potvrdily událost.', 'https://idnes.cz/x')],
  contradiction: [],
  uniqueReporting: [],
  framing: [],
}

const SOURCES = [
  { outlet: 'iDnes', articleUrl: 'https://idnes.cz/x', fullText: 'Plný text článku. Událost se stala.' },
]

const ENTITIES: KnownEntity[] = [{ key: 'person:petr-fiala', canonicalName: 'Petr Fiala', type: 'PERSON' }]

function validDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    blocks: [
      {
        type: 'paragraph',
        text: 'Podle <nt:e e1>Petra Fialy</nt:e> se <nt:s s1>iDnes</nt:s> shodl na tom, že <nt:v v1>241 miliard korun</nt:v> bylo schváleno.',
      },
      { type: 'quote', sourceId: 's1', text: 'Událost se stala' },
    ],
    assertions: [
      {
        id: 'a1',
        dimension: 'agreement',
        dimensionItemId: 'd1',
        entityRefs: ['e1'],
        sourceRefs: ['s1'],
        valueRefs: ['v1'],
      },
    ],
    entityRefs: [{ id: 'e1', entityKey: 'person:petr-fiala' }],
    sourceRefs: [{ id: 's1', articleUrl: 'https://idnes.cz/x' }],
    valueRefs: [{ id: 'v1', text: '241 miliard korun', sourceIds: ['s1'] }],
    ...overrides,
  }
}

describe('runNarrativePass', () => {
  beforeEach(() => vi.resetAllMocks())

  it('sends sources, dimensions and known entities to the LLM via Structured Outputs', async () => {
    vi.mocked(llmClientModule.callStructuredModel).mockResolvedValue(validDoc())

    await runNarrativePass(SOURCES, DIMENSIONS, ENTITIES)

    expect(llmClientModule.callStructuredModel).toHaveBeenCalledTimes(1)
    const [model, , userContent, callSite] = vi.mocked(llmClientModule.callStructuredModel).mock.calls[0]
    expect(model).toBe('gpt-4o')
    expect(callSite).toBe('narrative')
    const payload = JSON.parse(userContent) as { sources: unknown; dimensions: unknown; entities: unknown }
    expect(payload.sources).toEqual(SOURCES)
    expect(payload.dimensions).toEqual({
      agreement: DIMENSIONS.agreement,
      contradiction: [],
      uniqueReporting: [],
      framing: [],
    })
    expect(payload.entities).toEqual([
      { key: 'person:petr-fiala', canonicalName: 'Petr Fiala', type: 'PERSON' },
    ])
  })

  it('parses the transport markup into the persisted NarrativeInline AST and enriches refs', async () => {
    vi.mocked(llmClientModule.callStructuredModel).mockResolvedValue(validDoc())

    const result = await runNarrativePass(SOURCES, DIMENSIONS, ENTITIES)

    expect(result.version).toBe(1)
    expect(result.blocks[0]).toEqual({
      type: 'paragraph',
      children: [
        { type: 'text', text: 'Podle ' },
        { type: 'entity', entityId: 'e1', text: 'Petra Fialy' },
        { type: 'text', text: ' se ' },
        { type: 'source', sourceIds: ['s1'], text: 'iDnes' },
        { type: 'text', text: ' shodl na tom, že ' },
        { type: 'value', valueId: 'v1', text: '241 miliard korun' },
        { type: 'text', text: ' bylo schváleno.' },
      ],
    })
    expect(result.blocks[1]).toEqual({
      type: 'quote',
      sourceId: 's1',
      children: [{ type: 'text', text: 'Událost se stala' }],
    })
    // canonicalName resolved server-side from the known-entities list, not asked of the model.
    expect(result.entityRefs).toEqual([
      { id: 'e1', entityKey: 'person:petr-fiala', canonicalName: 'Petr Fiala' },
    ])
    expect(result.sourceRefs).toEqual([{ id: 's1', articleUrl: 'https://idnes.cz/x', outlet: 'iDnes' }])
    // normalizedValue/unit are derived by the deterministic Czech-numeral parser, not the model.
    expect(result.valueRefs).toEqual([
      {
        id: 'v1',
        text: '241 miliard korun',
        sourceIds: ['s1'],
        normalizedValue: 241_000_000_000,
        unit: 'CZK',
      },
    ])
    expect(result.assertions).toEqual(validDoc().assertions)
  })

  it('throws when the LLM response does not match the strict document schema', async () => {
    vi.mocked(llmClientModule.callStructuredModel).mockResolvedValue({ blocks: [{ type: 'paragraph' }] })

    await expect(runNarrativePass(SOURCES, DIMENSIONS, ENTITIES)).rejects.toThrow()
  })

  it('retries once and returns the corrected document when an inline ref is dangling then fixed', async () => {
    vi.mocked(llmClientModule.callStructuredModel)
      .mockResolvedValueOnce(
        validDoc({
          blocks: [{ type: 'paragraph', text: 'Zmínka o <nt:e e-missing>Petru Fialovi</nt:e>.' }],
          entityRefs: [],
        })
      )
      .mockResolvedValueOnce(validDoc())

    const result = await runNarrativePass(SOURCES, DIMENSIONS, ENTITIES)

    expect(result.blocks[0]).toMatchObject({ type: 'paragraph' })
    expect(llmClientModule.callStructuredModel).toHaveBeenCalledTimes(2)
  })

  it('throws NarrativeVerificationError when a dangling ref still fails after the retry', async () => {
    vi.mocked(llmClientModule.callStructuredModel).mockResolvedValue(
      validDoc({
        blocks: [{ type: 'paragraph', text: 'Zmínka o <nt:e e-missing>Petru Fialovi</nt:e>.' }],
        entityRefs: [],
      })
    )

    await expect(runNarrativePass(SOURCES, DIMENSIONS, ENTITIES)).rejects.toThrow(NarrativeVerificationError)
    expect(llmClientModule.callStructuredModel).toHaveBeenCalledTimes(2)
  })

  it('throws NarrativeVerificationError when a quote block is not a verbatim substring of its cited Source', async () => {
    vi.mocked(llmClientModule.callStructuredModel).mockResolvedValue(
      validDoc({ blocks: [{ type: 'quote', sourceId: 's1', text: 'citát, který v článku není' }] })
    )

    await expect(runNarrativePass(SOURCES, DIMENSIONS, ENTITIES)).rejects.toThrow(NarrativeVerificationError)
  })

  it('throws NarrativeVerificationError when an assertion cites a dimensionItemId that does not exist', async () => {
    vi.mocked(llmClientModule.callStructuredModel).mockResolvedValue(
      validDoc({
        assertions: [
          {
            id: 'a1',
            dimension: 'agreement',
            dimensionItemId: 'nonexistent',
            entityRefs: [],
            sourceRefs: [],
            valueRefs: [],
          },
        ],
      })
    )

    await expect(runNarrativePass(SOURCES, DIMENSIONS, ENTITIES)).rejects.toThrow(NarrativeVerificationError)
  })

  it('throws NarrativeVerificationError when the repair response does not match the schema', async () => {
    vi.mocked(llmClientModule.callStructuredModel)
      .mockResolvedValueOnce(
        validDoc({
          blocks: [{ type: 'paragraph', text: 'Zmínka o <nt:e e-missing>Petru Fialovi</nt:e>.' }],
          entityRefs: [],
        })
      )
      .mockResolvedValueOnce({ blocks: [{ type: 'paragraph' }] })

    await expect(runNarrativePass(SOURCES, DIMENSIONS, ENTITIES)).rejects.toThrow(NarrativeVerificationError)
  })
})
