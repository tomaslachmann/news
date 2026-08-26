import { describe, it, expect } from 'vitest'
import { buildBarChartData } from './narrativeChart'
import { indexNarrativeRefs } from './narrativeRefs'
import type { NarrativeDocument } from '@/services/analyses'

const DOCUMENT: NarrativeDocument = {
  version: 1,
  blocks: [],
  assertions: [],
  entityRefs: [],
  sourceRefs: [
    { id: 's1', outlet: 'iDnes', articleUrl: 'https://idnes.cz/x' },
    { id: 's2', outlet: 'ČTK', articleUrl: 'https://ctk.cz/y' },
  ],
  valueRefs: [
    { id: 'v1', text: '12 mrtvých', sourceIds: ['s1'], normalizedValue: 12, unit: null },
    { id: 'v2', text: '15 mrtvých', sourceIds: ['s2'], normalizedValue: 15, unit: null },
    { id: 'v3', text: 'hodně mrtvých', sourceIds: ['s1'], normalizedValue: null, unit: null },
  ],
}

describe('buildBarChartData', () => {
  it('builds one data point per resolved valueId, labeled by its reporting outlet(s)', () => {
    const refs = indexNarrativeRefs(DOCUMENT)
    expect(buildBarChartData(['v1', 'v2'], refs)).toEqual([
      { label: 'iDnes', value: 12 },
      { label: 'ČTK', value: 15 },
    ])
  })

  it('joins multiple reporting outlets into one label', () => {
    const refs = indexNarrativeRefs({
      ...DOCUMENT,
      valueRefs: [{ id: 'v1', text: '12 mrtvých', sourceIds: ['s1', 's2'], normalizedValue: 12, unit: null }],
    })
    expect(buildBarChartData(['v1'], refs)).toEqual([{ label: 'iDnes, ČTK', value: 12 }])
  })

  it('drops a value whose normalizedValue is null rather than plotting a fake zero', () => {
    const refs = indexNarrativeRefs(DOCUMENT)
    expect(buildBarChartData(['v1', 'v3'], refs)).toEqual([{ label: 'iDnes', value: 12 }])
  })

  it('drops a valueId that does not resolve to a declared valueRef', () => {
    const refs = indexNarrativeRefs(DOCUMENT)
    expect(buildBarChartData(['v-missing'], refs)).toEqual([])
  })

  it("falls back to the value ref's own text as the label when no source resolves", () => {
    const refs = indexNarrativeRefs({
      ...DOCUMENT,
      valueRefs: [
        { id: 'v1', text: '12 mrtvých', sourceIds: ['s-missing'], normalizedValue: 12, unit: null },
      ],
    })
    expect(buildBarChartData(['v1'], refs)).toEqual([{ label: '12 mrtvých', value: 12 }])
  })

  it('returns an empty array for an empty valueIds list', () => {
    const refs = indexNarrativeRefs(DOCUMENT)
    expect(buildBarChartData([], refs)).toEqual([])
  })
})
