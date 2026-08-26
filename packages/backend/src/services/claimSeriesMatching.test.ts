import { describe, it, expect } from 'vitest'
import { findTrackableValues, findCandidateSeries } from './claimSeriesMatching.js'
import type { NarrativeDocument } from '@news-triangulator/shared'

function doc(overrides: Partial<NarrativeDocument> = {}): NarrativeDocument {
  return {
    version: 1,
    blocks: [],
    assertions: [],
    entityRefs: [],
    sourceRefs: [],
    valueRefs: [],
    ...overrides,
  }
}

describe('findTrackableValues', () => {
  it('includes a value that is parseable and co-cited with an entity via an assertion', () => {
    const document = doc({
      valueRefs: [{ id: 'v1', text: '52 miliard Kč', sourceIds: ['s1'], normalizedValue: 52e9, unit: 'CZK' }],
      entityRefs: [{ id: 'e1', entityKey: 'org:ministerstvo-financi', canonicalName: 'MF', imageUrl: null }],
      assertions: [
        {
          id: 'a1',
          dimension: 'agreement',
          dimensionItemId: 'd1',
          entityRefs: ['e1'],
          sourceRefs: [],
          valueRefs: ['v1'],
        },
      ],
    })

    expect(findTrackableValues(document)).toEqual([
      {
        valueRefId: 'v1',
        text: '52 miliard Kč',
        normalizedValue: 52e9,
        unit: 'CZK',
        sourceIds: ['s1'],
        entityKeys: ['org:ministerstvo-financi'],
      },
    ])
  })

  it('excludes a value with unparseable text (normalizedValue null)', () => {
    const document = doc({
      valueRefs: [{ id: 'v1', text: 'hodně peněz', sourceIds: [], normalizedValue: null, unit: null }],
      entityRefs: [{ id: 'e1', entityKey: 'org:x', canonicalName: 'X', imageUrl: null }],
      assertions: [
        {
          id: 'a1',
          dimension: 'agreement',
          dimensionItemId: 'd1',
          entityRefs: ['e1'],
          sourceRefs: [],
          valueRefs: ['v1'],
        },
      ],
    })

    expect(findTrackableValues(document)).toEqual([])
  })

  it('excludes a value with zero entity co-occurrence', () => {
    const document = doc({
      valueRefs: [{ id: 'v1', text: '52 miliard Kč', sourceIds: [], normalizedValue: 52e9, unit: 'CZK' }],
      assertions: [],
    })

    expect(findTrackableValues(document)).toEqual([])
  })

  it('unions entity keys across every assertion that cites the same value', () => {
    const document = doc({
      valueRefs: [{ id: 'v1', text: '52 miliard Kč', sourceIds: [], normalizedValue: 52e9, unit: 'CZK' }],
      entityRefs: [
        { id: 'e1', entityKey: 'org:mf', canonicalName: 'MF', imageUrl: null },
        { id: 'e2', entityKey: 'person:x', canonicalName: 'X', imageUrl: null },
      ],
      assertions: [
        {
          id: 'a1',
          dimension: 'agreement',
          dimensionItemId: 'd1',
          entityRefs: ['e1'],
          sourceRefs: [],
          valueRefs: ['v1'],
        },
        {
          id: 'a2',
          dimension: 'framing',
          dimensionItemId: 'd2',
          entityRefs: ['e2'],
          sourceRefs: [],
          valueRefs: ['v1'],
        },
      ],
    })

    expect(findTrackableValues(document)[0]?.entityKeys.sort()).toEqual(['org:mf', 'person:x'])
  })

  it('does not attribute an entity from an assertion that cites a different value', () => {
    const document = doc({
      valueRefs: [
        { id: 'v1', text: '52 miliard Kč', sourceIds: [], normalizedValue: 52e9, unit: 'CZK' },
        { id: 'v2', text: '10 %', sourceIds: [], normalizedValue: 10, unit: '%' },
      ],
      entityRefs: [{ id: 'e1', entityKey: 'org:mf', canonicalName: 'MF', imageUrl: null }],
      assertions: [
        {
          id: 'a1',
          dimension: 'agreement',
          dimensionItemId: 'd1',
          entityRefs: ['e1'],
          sourceRefs: [],
          valueRefs: ['v2'],
        },
      ],
    })

    expect(findTrackableValues(document).map((v) => v.valueRefId)).toEqual(['v2'])
  })
})

describe('findCandidateSeries', () => {
  const VALUE = {
    valueRefId: 'v1',
    text: '18 miliard Kč',
    normalizedValue: 18e9,
    unit: 'CZK',
    sourceIds: ['s1'],
    entityKeys: ['org:mf'],
  }

  it('matches a series sharing at least one entity key and the same unit', () => {
    const candidates = findCandidateSeries(VALUE, [
      {
        seriesId: 'series1',
        entityKeys: ['org:mf'],
        unit: 'CZK',
        normalizedValue: 52e9,
        text: '52 miliard Kč',
      },
    ])
    expect(candidates.map((c) => c.seriesId)).toEqual(['series1'])
  })

  it('excludes a series with no shared entity key', () => {
    const candidates = findCandidateSeries(VALUE, [
      {
        seriesId: 'series1',
        entityKeys: ['person:someone-else'],
        unit: 'CZK',
        normalizedValue: 52e9,
        text: 'x',
      },
    ])
    expect(candidates).toEqual([])
  })

  it('excludes a series with a different unit, even with a shared entity key', () => {
    const candidates = findCandidateSeries(VALUE, [
      { seriesId: 'series1', entityKeys: ['org:mf'], unit: '%', normalizedValue: 10, text: 'x' },
    ])
    expect(candidates).toEqual([])
  })

  it('matches when both the value and the series have no unit (both null)', () => {
    const noUnitValue = { ...VALUE, unit: null }
    const candidates = findCandidateSeries(noUnitValue, [
      { seriesId: 'series1', entityKeys: ['org:mf'], unit: null, normalizedValue: 12, text: 'x' },
    ])
    expect(candidates.map((c) => c.seriesId)).toEqual(['series1'])
  })

  it('returns every matching candidate, not just the first', () => {
    const candidates = findCandidateSeries(VALUE, [
      { seriesId: 'series1', entityKeys: ['org:mf'], unit: 'CZK', normalizedValue: 52e9, text: 'x' },
      { seriesId: 'series2', entityKeys: ['org:mf'], unit: 'CZK', normalizedValue: 30e9, text: 'y' },
    ])
    expect(candidates.map((c) => c.seriesId).sort()).toEqual(['series1', 'series2'])
  })
})
