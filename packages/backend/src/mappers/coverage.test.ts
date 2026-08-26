import { describe, it, expect } from 'vitest'
import { resolveStoryPrimaryCategory } from './coverage.js'

function cov(primaryCategory: 'DOMESTIC' | 'WORLD' | 'SPORT' | null, createdAt: string) {
  return { primaryCategory, createdAt: new Date(createdAt) }
}

describe('resolveStoryPrimaryCategory', () => {
  it('returns the clear-majority category', () => {
    const result = resolveStoryPrimaryCategory([
      cov('DOMESTIC', '2026-01-01T00:00:00Z'),
      cov('DOMESTIC', '2026-01-01T01:00:00Z'),
      cov('WORLD', '2026-01-01T02:00:00Z'),
    ])

    expect(result).toBe('DOMESTIC')
  })

  it('breaks a tie by the earliest-attached Coverage among the tied categories', () => {
    const result = resolveStoryPrimaryCategory([
      cov('WORLD', '2026-01-01T05:00:00Z'),
      cov('DOMESTIC', '2026-01-01T02:00:00Z'),
      cov('SPORT', '2026-01-01T09:00:00Z'),
    ])

    // Each category has exactly one vote (a 3-way tie) -- DOMESTIC's Coverage is the earliest.
    expect(result).toBe('DOMESTIC')
  })

  it('returns null when no Coverage has a resolved category at all', () => {
    const result = resolveStoryPrimaryCategory([
      cov(null, '2026-01-01T00:00:00Z'),
      cov(null, '2026-01-01T01:00:00Z'),
    ])

    expect(result).toBeNull()
  })

  it('returns null for an empty Coverage list', () => {
    expect(resolveStoryPrimaryCategory([])).toBeNull()
  })

  it('ignores uncategorized Coverage when computing the majority', () => {
    const result = resolveStoryPrimaryCategory([
      cov(null, '2026-01-01T00:00:00Z'),
      cov('SPORT', '2026-01-01T01:00:00Z'),
    ])

    expect(result).toBe('SPORT')
  })
})
