import { describe, it, expect } from 'vitest'
import { indexNarrativeRefs, resolveSourceRefs } from './narrativeRefs'
import type { NarrativeDocument } from '@/services/analyses'

const DOCUMENT: NarrativeDocument = {
  version: 1,
  blocks: [],
  assertions: [],
  entityRefs: [{ id: 'e1', entityKey: 'person:petr-fiala', canonicalName: 'Petr Fiala', imageUrl: null }],
  sourceRefs: [
    { id: 's1', outlet: 'iDnes', articleUrl: 'https://idnes.cz/x' },
    { id: 's2', outlet: 'ČTK', articleUrl: 'https://ctk.cz/y' },
  ],
  valueRefs: [
    { id: 'v1', text: '241 miliard korun', sourceIds: ['s1'], normalizedValue: 241_000_000_000, unit: 'CZK' },
  ],
}

describe('indexNarrativeRefs', () => {
  it('indexes every resolved ref list by its own id', () => {
    const refs = indexNarrativeRefs(DOCUMENT)
    expect(refs.entities.get('e1')).toEqual(DOCUMENT.entityRefs[0])
    expect(refs.sources.get('s1')).toEqual(DOCUMENT.sourceRefs[0])
    expect(refs.values.get('v1')).toEqual(DOCUMENT.valueRefs[0])
  })

  it('returns empty maps for a document with no refs', () => {
    const refs = indexNarrativeRefs({ ...DOCUMENT, entityRefs: [], sourceRefs: [], valueRefs: [] })
    expect(refs.entities.size).toBe(0)
    expect(refs.sources.size).toBe(0)
    expect(refs.values.size).toBe(0)
  })
})

describe('resolveSourceRefs', () => {
  it('resolves multiple sourceIds, in order, to their declared refs', () => {
    const refs = indexNarrativeRefs(DOCUMENT)
    expect(resolveSourceRefs(['s2', 's1'], refs)).toEqual([DOCUMENT.sourceRefs[1], DOCUMENT.sourceRefs[0]])
  })

  it('silently drops an id with no declared ref rather than throwing', () => {
    const refs = indexNarrativeRefs(DOCUMENT)
    expect(resolveSourceRefs(['s1', 's-missing'], refs)).toEqual([DOCUMENT.sourceRefs[0]])
  })

  it('returns an empty array when no ids are given', () => {
    const refs = indexNarrativeRefs(DOCUMENT)
    expect(resolveSourceRefs([], refs)).toEqual([])
  })
})
