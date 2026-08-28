import { describe, it, expect } from 'vitest'
import { looksLikeEntityKey, nextActiveIndex } from './entityAutocompleteModel'

describe('looksLikeEntityKey', () => {
  it('accepts a real type:slug key', () => {
    expect(looksLikeEntityKey('person:petr-fiala')).toBe(true)
    expect(looksLikeEntityKey('  country:czechia  ')).toBe(true)
    // A canonical name in a non-Latin script keeps its script in the slug (deriveEntityKey).
    expect(looksLikeEntityKey('country:россия')).toBe(true)
  })

  it('rejects plain names and malformed keys', () => {
    expect(looksLikeEntityKey('Petr Fiala')).toBe(false)
    expect(looksLikeEntityKey('person:')).toBe(false)
    expect(looksLikeEntityKey(':fiala')).toBe(false)
    expect(looksLikeEntityKey('Person:Fiala')).toBe(false)
    expect(looksLikeEntityKey('')).toBe(false)
  })
})

describe('nextActiveIndex', () => {
  it('lands on the first/last item from the "nothing highlighted" state', () => {
    expect(nextActiveIndex(-1, 3, 1)).toBe(0)
    expect(nextActiveIndex(-1, 3, -1)).toBe(2)
  })

  it('wraps at both ends', () => {
    expect(nextActiveIndex(2, 3, 1)).toBe(0)
    expect(nextActiveIndex(0, 3, -1)).toBe(2)
    expect(nextActiveIndex(1, 3, 1)).toBe(2)
  })

  it('stays at -1 for an empty list', () => {
    expect(nextActiveIndex(-1, 0, 1)).toBe(-1)
    expect(nextActiveIndex(0, 0, -1)).toBe(-1)
  })
})
