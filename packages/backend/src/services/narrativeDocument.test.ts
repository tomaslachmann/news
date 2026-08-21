import { describe, it, expect, vi } from 'vitest'
import {
  LlmNarrativeDocumentSchema,
  parseInlineMarkup,
  findNarrativeVerificationFailures,
  verifyNarrativeDocumentOrThrow,
  buildNarrativeDocument,
  NarrativeVerificationError,
  type LlmNarrativeDocument,
  type NarrativeVerificationContext,
} from './narrativeDocument.js'

function validDoc(overrides: Partial<LlmNarrativeDocument> = {}): LlmNarrativeDocument {
  return {
    blocks: [
      { type: 'paragraph', text: 'Podle <nt:e e1>Petra Fialy</nt:e> se to stalo.' },
      { type: 'quote', sourceId: 's1', text: 'Událost se stala' },
    ],
    assertions: [
      {
        id: 'a1',
        dimension: 'agreement',
        dimensionItemId: 'd1',
        entityRefs: ['e1'],
        sourceRefs: ['s1'],
        valueRefs: [],
      },
    ],
    entityRefs: [{ id: 'e1', entityKey: 'person:petr-fiala' }],
    sourceRefs: [{ id: 's1', articleUrl: 'https://idnes.cz/x' }],
    valueRefs: [],
    ...overrides,
  }
}

const CONTEXT: NarrativeVerificationContext = {
  sourceTextByArticleUrl: new Map([['https://idnes.cz/x', 'Plný text. Událost se stala. Konec.']]),
  knownEntityKeys: new Set(['person:petr-fiala']),
  dimensionItemIdsByDimension: {
    agreement: new Set(['d1']),
    contradiction: new Set(),
    unique_reporting: new Set(),
    framing: new Set(),
  },
}

describe('LlmNarrativeDocumentSchema', () => {
  it('accepts a valid document', () => {
    expect(LlmNarrativeDocumentSchema.safeParse(validDoc()).success).toBe(true)
  })

  it('rejects a block with an unknown type', () => {
    const result = LlmNarrativeDocumentSchema.safeParse(
      validDoc({ blocks: [{ type: 'section', text: 'x' } as never] })
    )
    expect(result.success).toBe(false)
  })

  it('rejects a quote block missing its required sourceId', () => {
    const result = LlmNarrativeDocumentSchema.safeParse(
      validDoc({ blocks: [{ type: 'quote', text: 'x' } as never] })
    )
    expect(result.success).toBe(false)
  })

  it('rejects a heading with a level outside 2|3', () => {
    const result = LlmNarrativeDocumentSchema.safeParse(
      validDoc({ blocks: [{ type: 'heading', level: 4, text: 'x' } as never] })
    )
    expect(result.success).toBe(false)
  })

  it('accepts a list block with ordered/bullet items', () => {
    const result = LlmNarrativeDocumentSchema.safeParse(
      validDoc({ blocks: [{ type: 'list', style: 'bullet', items: [{ text: 'a' }, { text: 'b' }] }] })
    )
    expect(result.success).toBe(true)
  })
})

describe('parseInlineMarkup', () => {
  it('parses plain text with no tags as a single text run', () => {
    expect(parseInlineMarkup('Obyčejný text.')).toEqual([{ type: 'text', text: 'Obyčejný text.' }])
  })

  it('parses an entity tag surrounded by plain text', () => {
    expect(parseInlineMarkup('Podle <nt:e e1>Petra Fialy</nt:e> se to stalo.')).toEqual([
      { type: 'text', text: 'Podle ' },
      { type: 'entity', entityId: 'e1', text: 'Petra Fialy' },
      { type: 'text', text: ' se to stalo.' },
    ])
  })

  it('parses a value tag', () => {
    expect(parseInlineMarkup('<nt:v v1>241 miliard korun</nt:v> bylo schváleno.')).toEqual([
      { type: 'value', valueId: 'v1', text: '241 miliard korun' },
      { type: 'text', text: ' bylo schváleno.' },
    ])
  })

  it('parses a source tag with multiple comma-separated ids', () => {
    expect(parseInlineMarkup('<nt:s s1,s2>ČTK a iDNES</nt:s> to potvrdily.')).toEqual([
      { type: 'source', sourceIds: ['s1', 's2'], text: 'ČTK a iDNES' },
      { type: 'text', text: ' to potvrdily.' },
    ])
  })

  it('parses multiple tags in sequence', () => {
    expect(parseInlineMarkup('<nt:e e1>Fiala</nt:e> a <nt:e e2>Tusk</nt:e> se sešli.')).toEqual([
      { type: 'entity', entityId: 'e1', text: 'Fiala' },
      { type: 'text', text: ' a ' },
      { type: 'entity', entityId: 'e2', text: 'Tusk' },
      { type: 'text', text: ' se sešli.' },
    ])
  })

  it('returns an empty array for an empty string', () => {
    expect(parseInlineMarkup('')).toEqual([])
  })
})

describe('findNarrativeVerificationFailures', () => {
  it('returns no failures for a fully valid document', () => {
    expect(findNarrativeVerificationFailures(validDoc(), CONTEXT)).toEqual([])
  })

  it('flags an inline entity tag whose id is not declared in entityRefs', () => {
    const doc = validDoc({
      blocks: [{ type: 'paragraph', text: 'Zmínka o <nt:e e-missing>Petru Fialovi</nt:e>.' }],
    })
    const failures = findNarrativeVerificationFailures(doc, CONTEXT)
    expect(failures.some((f) => f.includes('e-missing'))).toBe(true)
  })

  it('flags an inline value tag whose id is not declared in valueRefs', () => {
    const doc = validDoc({
      blocks: [{ type: 'paragraph', text: 'Částka <nt:v v-missing>100 Kč</nt:v>.' }],
    })
    const failures = findNarrativeVerificationFailures(doc, CONTEXT)
    expect(failures.some((f) => f.includes('v-missing'))).toBe(true)
  })

  it('flags an inline source tag whose id is not declared in sourceRefs', () => {
    const doc = validDoc({
      blocks: [{ type: 'paragraph', text: 'Podle <nt:s s-missing>iDnes</nt:s>.' }],
    })
    const failures = findNarrativeVerificationFailures(doc, CONTEXT)
    expect(failures.some((f) => f.includes('s-missing'))).toBe(true)
  })

  it('flags a list item text with a dangling ref, not just top-level block text', () => {
    const doc = validDoc({
      blocks: [{ type: 'list', style: 'bullet', items: [{ text: '<nt:e e-missing>X</nt:e>' }] }],
    })
    const failures = findNarrativeVerificationFailures(doc, CONTEXT)
    expect(failures.some((f) => f.includes('items[0]') && f.includes('e-missing'))).toBe(true)
  })

  it('flags a quote block whose sourceId is not declared in sourceRefs', () => {
    const doc = validDoc({ blocks: [{ type: 'quote', sourceId: 's-missing', text: 'Událost se stala' }] })
    const failures = findNarrativeVerificationFailures(doc, CONTEXT)
    expect(failures.some((f) => f.includes('s-missing'))).toBe(true)
  })

  it('flags a quote block whose text is not a verbatim substring of its cited Source', () => {
    const doc = validDoc({ blocks: [{ type: 'quote', sourceId: 's1', text: 'citát, který v článku není' }] })
    const failures = findNarrativeVerificationFailures(doc, CONTEXT)
    expect(failures.some((f) => f.includes('verbatim'))).toBe(true)
  })

  it('does not flag a quote block whose text is a verbatim substring even with inline markup inside it', () => {
    const doc = validDoc({
      blocks: [{ type: 'quote', sourceId: 's1', text: '<nt:e e1>Událost</nt:e> se stala' }],
    })
    expect(findNarrativeVerificationFailures(doc, CONTEXT)).toEqual([])
  })

  it('flags an assertion citing a dimensionItemId that does not exist in the named dimension', () => {
    const doc = validDoc({
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
    const failures = findNarrativeVerificationFailures(doc, CONTEXT)
    expect(failures.some((f) => f.includes('nonexistent'))).toBe(true)
  })

  it('flags an assertion citing a dimensionItemId that exists, but under a different dimension', () => {
    const doc = validDoc({
      assertions: [
        {
          id: 'a1',
          dimension: 'framing',
          dimensionItemId: 'd1',
          entityRefs: [],
          sourceRefs: [],
          valueRefs: [],
        },
      ],
    })
    const failures = findNarrativeVerificationFailures(doc, CONTEXT)
    expect(failures.some((f) => f.includes('d1'))).toBe(true)
  })

  it('flags an assertion whose entityRefs/sourceRefs/valueRefs cite an undeclared ref', () => {
    const doc = validDoc({
      assertions: [
        {
          id: 'a1',
          dimension: 'agreement',
          dimensionItemId: 'd1',
          entityRefs: ['e-missing'],
          sourceRefs: [],
          valueRefs: ['v-missing'],
        },
      ],
    })
    const failures = findNarrativeVerificationFailures(doc, CONTEXT)
    expect(failures.some((f) => f.includes('e-missing'))).toBe(true)
    expect(failures.some((f) => f.includes('v-missing'))).toBe(true)
  })

  it("flags a declared entityRef whose entityKey is not one of the Story's known entities", () => {
    const doc = validDoc({ entityRefs: [{ id: 'e1', entityKey: 'person:hallucinated' }] })
    const failures = findNarrativeVerificationFailures(doc, CONTEXT)
    expect(failures.some((f) => f.includes('person:hallucinated'))).toBe(true)
  })

  it('flags a declared sourceRef whose articleUrl is not one of the given sources', () => {
    const doc = validDoc({ sourceRefs: [{ id: 's1', articleUrl: 'https://hallucinated.cz/x' }] })
    const failures = findNarrativeVerificationFailures(doc, CONTEXT)
    expect(failures.some((f) => f.includes('https://hallucinated.cz/x'))).toBe(true)
  })

  it('flags leftover raw markup from an unclosed inline tag', () => {
    const doc = validDoc({
      blocks: [{ type: 'paragraph', text: 'Podle <nt:e e1>Petra Fialy se to stalo.' }],
    })
    const failures = findNarrativeVerificationFailures(doc, CONTEXT)
    expect(failures.some((f) => f.includes('leftover raw inline markup'))).toBe(true)
  })

  it('flags leftover raw markup from a same-kind tag nested inside another', () => {
    const doc = validDoc({
      blocks: [{ type: 'paragraph', text: '<nt:e e1>Fiala a <nt:e e2>Tusk</nt:e></nt:e> se sešli.' }],
      entityRefs: [
        { id: 'e1', entityKey: 'person:petr-fiala' },
        { id: 'e2', entityKey: 'person:petr-fiala' },
      ],
    })
    const failures = findNarrativeVerificationFailures(doc, CONTEXT)
    expect(failures.some((f) => f.includes('leftover raw inline markup'))).toBe(true)
  })
})

describe('verifyNarrativeDocumentOrThrow', () => {
  it('returns the document unchanged, without calling repair, when it is already valid', async () => {
    const repair = vi.fn()
    const result = await verifyNarrativeDocumentOrThrow(validDoc(), CONTEXT, repair)
    expect(result).toEqual(validDoc())
    expect(repair).not.toHaveBeenCalled()
  })

  it('retries once and returns the repaired document when the repair fixes every failure', async () => {
    const broken = validDoc({
      blocks: [{ type: 'paragraph', text: 'Zmínka o <nt:e e-missing>Petru Fialovi</nt:e>.' }],
    })
    const repair = vi.fn<(failures: string[]) => Promise<unknown>>().mockResolvedValue(validDoc())

    const result = await verifyNarrativeDocumentOrThrow(broken, CONTEXT, repair)

    expect(result).toEqual(validDoc())
    expect(repair).toHaveBeenCalledTimes(1)
    const [failures] = repair.mock.calls[0]
    expect(failures.length).toBeGreaterThan(0)
  })

  it('retries the whole document, not per-block, when only one of several blocks is invalid — the repaired result keeps the other, already-valid blocks intact', async () => {
    const goodHeading = { type: 'heading' as const, level: 2 as const, text: 'Nadpis' }
    const broken = validDoc({
      blocks: [goodHeading, { type: 'paragraph', text: 'Zmínka o <nt:e e-missing>Petru Fialovi</nt:e>.' }],
    })
    const repaired = validDoc({ blocks: [goodHeading, { type: 'paragraph', text: 'Opraveno.' }] })
    const repair = vi.fn<(failures: string[]) => Promise<unknown>>().mockResolvedValue(repaired)

    const result = await verifyNarrativeDocumentOrThrow(broken, CONTEXT, repair)

    expect(result).toEqual(repaired)
    expect(result.blocks[0]).toEqual(goodHeading)
    expect(repair).toHaveBeenCalledTimes(1)
  })

  it('throws NarrativeVerificationError, never dropping content, when the repair response does not match the schema', async () => {
    const broken = validDoc({
      blocks: [{ type: 'paragraph', text: 'Zmínka o <nt:e e-missing>Petru Fialovi</nt:e>.' }],
    })
    const repair = vi.fn().mockResolvedValue({ blocks: [{ type: 'paragraph' }] })

    await expect(verifyNarrativeDocumentOrThrow(broken, CONTEXT, repair)).rejects.toThrow(
      NarrativeVerificationError
    )
  })

  it('throws NarrativeVerificationError when the repaired document still fails verification', async () => {
    const broken = validDoc({
      blocks: [{ type: 'paragraph', text: 'Zmínka o <nt:e e-missing>Petru Fialovi</nt:e>.' }],
    })
    const repair = vi.fn().mockResolvedValue(
      validDoc({
        blocks: [{ type: 'paragraph', text: 'Pořád <nt:e e-still-missing>chybí</nt:e>.' }],
      })
    )

    await expect(verifyNarrativeDocumentOrThrow(broken, CONTEXT, repair)).rejects.toThrow(
      NarrativeVerificationError
    )
    expect(repair).toHaveBeenCalledTimes(1)
  })
})

describe('buildNarrativeDocument', () => {
  const BUILD_CONTEXT = {
    entitiesByKey: new Map([
      [
        'person:petr-fiala',
        {
          key: 'person:petr-fiala',
          canonicalName: 'Petr Fiala',
          type: 'PERSON' as const,
          imageUrl: 'https://commons.wikimedia.org/fiala.jpg',
        },
      ],
    ]),
    outletByArticleUrl: new Map([['https://idnes.cz/x', 'iDnes']]),
  }

  it('parses every block/list-item text into the persisted NarrativeInline AST', () => {
    const doc = validDoc({
      blocks: [
        { type: 'heading', level: 2, text: 'Nadpis' },
        { type: 'list', style: 'ordered', items: [{ text: 'První <nt:e e1>Petr Fiala</nt:e>' }] },
      ],
    })

    const result = buildNarrativeDocument(doc, BUILD_CONTEXT)

    expect(result.version).toBe(1)
    expect(result.blocks[0]).toEqual({
      type: 'heading',
      level: 2,
      children: [{ type: 'text', text: 'Nadpis' }],
    })
    expect(result.blocks[1]).toEqual({
      type: 'list',
      style: 'ordered',
      items: [
        {
          children: [
            { type: 'text', text: 'První ' },
            { type: 'entity', entityId: 'e1', text: 'Petr Fiala' },
          ],
        },
      ],
    })
  })

  it("resolves an entity ref's canonicalName and imageUrl from the known-entities map", () => {
    const result = buildNarrativeDocument(validDoc(), BUILD_CONTEXT)
    expect(result.entityRefs).toEqual([
      {
        id: 'e1',
        entityKey: 'person:petr-fiala',
        canonicalName: 'Petr Fiala',
        imageUrl: 'https://commons.wikimedia.org/fiala.jpg',
      },
    ])
  })

  it('falls back to the raw entityKey as canonicalName, and null imageUrl, when the key is unknown', () => {
    const doc = validDoc({ entityRefs: [{ id: 'e1', entityKey: 'person:unknown' }] })
    const result = buildNarrativeDocument(doc, BUILD_CONTEXT)
    expect(result.entityRefs).toEqual([
      { id: 'e1', entityKey: 'person:unknown', canonicalName: 'person:unknown', imageUrl: null },
    ])
  })

  it('leaves imageUrl null for a known entity that has no fetched EntityImage', () => {
    const doc = validDoc({ entityRefs: [{ id: 'e1', entityKey: 'person:no-image' }] })
    const context = {
      entitiesByKey: new Map([
        [
          'person:no-image',
          { key: 'person:no-image', canonicalName: 'No Image', type: 'PERSON' as const, imageUrl: null },
        ],
      ]),
      outletByArticleUrl: BUILD_CONTEXT.outletByArticleUrl,
    }
    const result = buildNarrativeDocument(doc, context)
    expect(result.entityRefs).toEqual([
      { id: 'e1', entityKey: 'person:no-image', canonicalName: 'No Image', imageUrl: null },
    ])
  })

  it("resolves a source ref's outlet from the sources given to the pass", () => {
    const result = buildNarrativeDocument(validDoc(), BUILD_CONTEXT)
    expect(result.sourceRefs).toEqual([{ id: 's1', articleUrl: 'https://idnes.cz/x', outlet: 'iDnes' }])
  })

  it('computes normalizedValue/unit for a value ref via the deterministic Czech-numeral parser', () => {
    const doc = validDoc({ valueRefs: [{ id: 'v1', text: '241 miliard korun', sourceIds: ['s1'] }] })
    const result = buildNarrativeDocument(doc, BUILD_CONTEXT)
    expect(result.valueRefs).toEqual([
      {
        id: 'v1',
        text: '241 miliard korun',
        sourceIds: ['s1'],
        normalizedValue: 241_000_000_000,
        unit: 'CZK',
      },
    ])
  })

  it('leaves normalizedValue/unit null for unparseable value text, rather than guessing', () => {
    const doc = validDoc({ valueRefs: [{ id: 'v1', text: 'hodně peněz', sourceIds: ['s1'] }] })
    const result = buildNarrativeDocument(doc, BUILD_CONTEXT)
    expect(result.valueRefs).toEqual([
      { id: 'v1', text: 'hodně peněz', sourceIds: ['s1'], normalizedValue: null, unit: null },
    ])
  })

  it('carries assertions through unchanged', () => {
    const result = buildNarrativeDocument(validDoc(), BUILD_CONTEXT)
    expect(result.assertions).toEqual(validDoc().assertions)
  })
})
