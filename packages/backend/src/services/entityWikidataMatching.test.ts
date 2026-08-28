import { describe, it, expect } from 'vitest'
import {
  evaluateAutoLink,
  labelMatchScore,
  normalizeName,
  scoreCandidate,
  TYPE_P31_QIDS,
  type WikidataItemDetail,
} from './entityWikidataMatching.js'

function item(overrides: Partial<WikidataItemDetail> = {}): WikidataItemDetail {
  return {
    qid: 'Q1',
    label: 'Petr Fiala',
    names: ['Petr Fiala'],
    description: 'český politik',
    p31: ['Q5'],
    sitelinkCount: 25,
    hasCswikiSitelink: true,
    ...overrides,
  }
}

describe('normalizeName', () => {
  it('folds case, diacritics, and internal whitespace', () => {
    expect(normalizeName('Petr  Fiala')).toBe('petr fiala')
    expect(normalizeName('ČESKÁ TELEVIZE')).toBe('ceska televize')
    expect(normalizeName('  Brno ')).toBe('brno')
  })
})

describe('labelMatchScore', () => {
  it('is 1 for an exact normalized match against any name', () => {
    expect(labelMatchScore('Petr Fiala', ['Something else', 'petr  fiala'])).toBe(1)
  })

  it('is a partial Jaccard score for a token overlap, not a substring match', () => {
    expect(labelMatchScore('Petr Fiala', ['Fiala'])).toBeCloseTo(0.5)
    expect(labelMatchScore('Petr Fiala', ['Jan Novák'])).toBe(0)
  })
})

describe('scoreCandidate', () => {
  it('scores an exact-name, type-coherent, cswiki, popular candidate near the top', () => {
    const a = scoreCandidate(item(), 'PERSON', 'Petr Fiala')
    expect(a.labelMatch).toBe(1)
    expect(a.typeCoherent).toBe(true)
    expect(a.hasCswikiSitelink).toBe(true)
    expect(a.isWikimediaInternal).toBe(false)
    expect(a.score).toBe(100)
  })

  it('drops type weight when P31 does not match the entity type', () => {
    const a = scoreCandidate(item({ p31: ['Q11424'] }), 'PERSON', 'Petr Fiala')
    expect(a.typeCoherent).toBe(false)
    expect(a.score).toBe(75)
  })

  it('scores a Wikimedia-internal item (disambiguation page) at 0', () => {
    const a = scoreCandidate(item({ p31: ['Q4167410'] }), 'PERSON', 'Petr Fiala')
    expect(a.isWikimediaInternal).toBe(true)
    expect(a.score).toBe(0)
  })

  it('walks the enumerated org subtypes for typeCoherent (company counts as ORGANIZATION)', () => {
    const a = scoreCandidate(item({ p31: ['Q4830453'] }), 'ORGANIZATION', 'ČEZ')
    expect(a.typeCoherent).toBe(true)
    expect(TYPE_P31_QIDS.ORGANIZATION).toContain('Q4830453')
  })
})

describe('evaluateAutoLink', () => {
  const base = { entityType: 'PERSON' as const, canonicalName: 'Petr Fiala' }

  it('passes when all conditions hold and there is no rival', () => {
    const primary = item()
    expect(evaluateAutoLink({ ...base, primary, rivals: [primary] })).toEqual({ pass: true, failures: [] })
  })

  it('fails on an inexact name match', () => {
    const primary = item({ names: ['Fiala'] })
    const v = evaluateAutoLink({ ...base, primary, rivals: [primary] })
    expect(v.pass).toBe(false)
    expect(v.failures).toContain('není přesná shoda jména')
  })

  it('fails when the item has no cswiki sitelink', () => {
    const primary = item({ hasCswikiSitelink: false })
    const v = evaluateAutoLink({ ...base, primary, rivals: [primary] })
    expect(v.pass).toBe(false)
    expect(v.failures).toContain('položka nemá článek na cs.wikipedia')
  })

  it('fails when a rival of the same type also has an exact name match', () => {
    const primary = item({ qid: 'Q1' })
    const rival = item({ qid: 'Q2' })
    const v = evaluateAutoLink({ ...base, primary, rivals: [primary, rival] })
    expect(v.pass).toBe(false)
    expect(v.failures).toContain('existuje jiná položka stejného typu se shodným jménem')
  })

  it('does NOT count a rival of a different type or an inexact-name rival', () => {
    const primary = item({ qid: 'Q1' })
    const wrongType = item({ qid: 'Q2', p31: ['Q11424'] })
    const inexact = item({ qid: 'Q3', names: ['P. Fiala'] })
    expect(evaluateAutoLink({ ...base, primary, rivals: [primary, wrongType, inexact] }).pass).toBe(true)
  })
})
