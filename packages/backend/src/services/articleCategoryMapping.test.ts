import { describe, it, expect } from 'vitest'
import { resolvePrimaryCategory, resolveCategoryForCandidate } from './articleCategoryMapping.js'

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

  it("resolves Lifestyle/Komentáře, added after sampling Novinky's real szn:sections values live (ticket 85)", () => {
    expect(resolvePrimaryCategory('src-novinky', ['Recepty', 'Lifestyle'])).toBe('LIFESTYLE')
    expect(resolvePrimaryCategory('src-seznamzpravy', ['Komentáře'])).toBe('COMMENTARY')
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

  it('resolves Deník, skipping its own no-clean-fit noise tags (ticket 84)', () => {
    expect(resolvePrimaryCategory('src-denik', ['Evropa'])).toBe('WORLD')
    expect(resolvePrimaryCategory('src-denik', ['Nehody'])).toBe('CRIME')
    expect(resolvePrimaryCategory('src-denik', ['Autotesty', 'Zahrada'])).toBeNull()
  })

  it('resolves Echo24, skipping its own syndication/format noise tags (ticket 84)', () => {
    expect(resolvePrimaryCategory('src-echo24', ['Domov'])).toBe('DOMESTIC')
    expect(resolvePrimaryCategory('src-echo24', ['Homepage', 'Bing cz', 'Svět'])).toBe('WORLD')
    expect(resolvePrimaryCategory('src-echo24', ['Krátké zprávy', 'iPrima'])).toBeNull()
  })

  it('resolves CNN Prima NEWS, skipping its own per-country topic tags (ticket 84)', () => {
    expect(resolvePrimaryCategory('src-cnnprima', ['Krimi'])).toBe('CRIME')
    expect(resolvePrimaryCategory('src-cnnprima', ['Jihomoravský kraj'])).toBe('REGIONAL')
    expect(resolvePrimaryCategory('src-cnnprima', ['Německo', 'Ukrajina'])).toBeNull()
  })
})

describe('resolveCategoryForCandidate', () => {
  it("uses the feed's own category directly, without consulting the per-item mapping table at all (ticket 79)", () => {
    // src-irozhlas has no mapping table (per-item tags carry no signal for it) -- feedCategory
    // must still win, since a category-scoped feed URL needs no per-item lookup.
    expect(
      resolveCategoryForCandidate({
        sourceId: 'src-irozhlas',
        rawCategories: undefined,
        feedCategory: 'ECONOMY',
      })
    ).toBe('ECONOMY')
  })

  it('ignores rawCategories entirely when feedCategory is set, even if they would resolve differently', () => {
    expect(
      resolveCategoryForCandidate({
        sourceId: 'src-novinky',
        rawCategories: ['Sport'],
        feedCategory: 'ECONOMY',
      })
    ).toBe('ECONOMY')
  })

  it('falls back to the per-item mapping-table lookup when feedCategory is null (an all-articles feed)', () => {
    expect(
      resolveCategoryForCandidate({
        sourceId: 'src-novinky',
        rawCategories: ['Domácí'],
        feedCategory: null,
      })
    ).toBe('DOMESTIC')
  })

  it('falls back to the per-item mapping-table lookup when feedCategory is undefined', () => {
    expect(resolveCategoryForCandidate({ sourceId: 'src-novinky', rawCategories: ['Sport'] })).toBe('SPORT')
  })

  it('returns null when neither feedCategory nor any raw category resolves', () => {
    expect(resolveCategoryForCandidate({ sourceId: 'src-irozhlas', rawCategories: undefined })).toBeNull()
  })
})
