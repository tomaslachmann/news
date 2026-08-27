import { describe, it, expect } from 'vitest'
import { buildSearchText } from './searchIndexing.js'

function item(prose: string) {
  return { id: 'i1', prose, attributions: [] }
}

describe('buildSearchText', () => {
  it('flattens seedHeadline, headline, and every dimension item prose into one space-joined string', () => {
    const result = buildSearchText('Working title', 'Generated headline', {
      agreement: [item('Fakt 1')],
      contradiction: [item('Rozpor 1')],
      uniqueReporting: [item('Unikát 1')],
      framing: [item('Framing 1')],
    })

    expect(result).toBe('Working title Generated headline Fakt 1 Rozpor 1 Unikát 1 Framing 1')
  })

  it('omits headline entirely (not a literal "null") when generation was skipped', () => {
    const result = buildSearchText('Working title', null, {
      agreement: [],
      contradiction: [],
      uniqueReporting: [],
      framing: [],
    })

    expect(result).toBe('Working title')
  })

  it('includes multiple items within the same dimension, in order', () => {
    const result = buildSearchText('x', null, {
      agreement: [item('A1'), item('A2')],
      contradiction: [],
      uniqueReporting: [],
      framing: [],
    })

    expect(result).toBe('x A1 A2')
  })

  it('returns just the seedHeadline when every dimension is empty and headline is null', () => {
    const result = buildSearchText('Working title only', null, {
      agreement: [],
      contradiction: [],
      uniqueReporting: [],
      framing: [],
    })

    expect(result).toBe('Working title only')
  })
})
