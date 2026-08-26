import { describe, it, expect } from 'vitest'
import { resolvePrimaryCategory } from './articleCategoryMapping.js'

describe('resolvePrimaryCategory', () => {
  it('picks the first raw category value that maps to a real ArticleCategory', () => {
    expect(resolvePrimaryCategory('src-denikn', ['Ruská válka na Ukrajině', 'Svět', 'Ekonomika'])).toBe(
      'WORLD'
    )
  })

  it('returns null when none of the raw category values map for this source', () => {
    expect(resolvePrimaryCategory('src-denikn', ['Investigativa', 'USA'])).toBeNull()
  })

  it('returns null for a source with no mapping table at all (e.g. iRozhlas until ticket 79)', () => {
    expect(resolvePrimaryCategory('src-irozhlas', ['zpravy-domov'])).toBeNull()
  })

  it('returns null when rawCategories is undefined', () => {
    expect(resolvePrimaryCategory('src-novinky', undefined)).toBeNull()
  })

  it('returns null when rawCategories is empty', () => {
    expect(resolvePrimaryCategory('src-novinky', [])).toBeNull()
  })

  it('resolves each of the four shared-rubric outlets against the same standard Czech vocabulary', () => {
    expect(resolvePrimaryCategory('src-novinky', ['Domácí'])).toBe('DOMESTIC')
    expect(resolvePrimaryCategory('src-aktualne', ['Zahraničí'])).toBe('WORLD')
    expect(resolvePrimaryCategory('src-ct24', ['Svět'])).toBe('WORLD')
    expect(resolvePrimaryCategory('src-seznamzpravy', ['Sport'])).toBe('SPORT')
  })

  it("resolves České noviny's terse single-letter codes", () => {
    expect(resolvePrimaryCategory('src-ceskenoviny', ['d'])).toBe('DOMESTIC')
    expect(resolvePrimaryCategory('src-ceskenoviny', ['m'])).toBe('WORLD')
    expect(resolvePrimaryCategory('src-ceskenoviny', ['e'])).toBe('ECONOMY')
    expect(resolvePrimaryCategory('src-ceskenoviny', ['s'])).toBe('SPORT')
  })

  it("maps Deník N's own domestic-rubric wording (Česko), distinct from the other outlets' Domácí", () => {
    expect(resolvePrimaryCategory('src-denikn', ['Česko'])).toBe('DOMESTIC')
  })
})
