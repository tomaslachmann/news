import { describe, it, expect } from 'vitest'
import { cosineSimilarity, timeDecayFactor, findBestMatch, buildEmbeddingInput } from './storyMatching.js'

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1)
  })

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0)
  })

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1)
  })

  it('returns 0 for empty or mismatched-length vectors instead of throwing', () => {
    expect(cosineSimilarity([], [1, 0, 0])).toBe(0)
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0)
  })

  it('returns 0 for a zero vector instead of dividing by zero', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 0, 0])).toBe(0)
  })
})

describe('timeDecayFactor', () => {
  it('is 1.0 at age zero', () => {
    expect(timeDecayFactor(0)).toBeCloseTo(1)
  })

  it('stays at full strength throughout the grace period, so same-day coverage from a different outlet still matches', () => {
    expect(timeDecayFactor(12)).toBeCloseTo(1)
    expect(timeDecayFactor(23)).toBeCloseTo(1)
  })

  it('halves one half-life past the grace period', () => {
    expect(timeDecayFactor(48)).toBeCloseTo(0.5)
  })

  it('decreases monotonically with age once past the grace period', () => {
    expect(timeDecayFactor(96)).toBeLessThan(timeDecayFactor(72))
    expect(timeDecayFactor(72)).toBeLessThan(timeDecayFactor(48))
    expect(timeDecayFactor(48)).toBeLessThan(timeDecayFactor(24))
  })

  it('treats negative age (clock skew) the same as zero rather than boosting the score', () => {
    expect(timeDecayFactor(-5)).toBeCloseTo(1)
  })
})

describe('findBestMatch', () => {
  const now = new Date('2026-01-02T00:00:00Z')

  it('returns the matching candidate when similarity clears the threshold', () => {
    const candidate = {
      storyId: 's1',
      analysisId: 'a1',
      analysisStatus: 'PENDING',
      embedding: [1, 0, 0],
      createdAt: now,
    }

    expect(findBestMatch([1, 0, 0], [candidate], now)).toEqual(candidate)
  })

  it('returns null when no candidate clears the threshold', () => {
    const candidate = {
      storyId: 's1',
      analysisId: 'a1',
      analysisStatus: 'PENDING',
      embedding: [0, 1, 0],
      createdAt: now,
    }

    expect(findBestMatch([1, 0, 0], [candidate], now)).toBeNull()
  })

  it('returns null for an empty candidate list', () => {
    expect(findBestMatch([1, 0, 0], [], now)).toBeNull()
  })

  it('still matches a same-day, high-similarity candidate published hours apart by a different outlet', () => {
    // Regression: a flat decay with no grace period used to make even a perfect match fail
    // after ~10 hours, well inside the 48h dedup window two outlets' morning/evening editions
    // of the same event would realistically fall within.
    const sameDayCandidate = {
      storyId: 's1',
      analysisId: 'a1',
      analysisStatus: 'PENDING',
      embedding: [1, 0, 0],
      createdAt: new Date(now.getTime() - 18 * 60 * 60 * 1000),
    }

    expect(findBestMatch([1, 0, 0], [sameDayCandidate], now)).toEqual(sameDayCandidate)
  })

  it('lets time decay push an old, otherwise-perfect match below the threshold', () => {
    const veryOld = {
      storyId: 's1',
      analysisId: 'a1',
      analysisStatus: 'PENDING',
      embedding: [1, 0, 0],
      createdAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    }

    expect(findBestMatch([1, 0, 0], [veryOld], now)).toBeNull()
  })

  it('picks the highest-scoring candidate among several', () => {
    const weak = {
      storyId: 's-weak',
      analysisId: 'a-weak',
      analysisStatus: 'PENDING',
      embedding: [0.8, 0.2, 0],
      createdAt: now,
    }
    const strong = {
      storyId: 's-strong',
      analysisId: 'a-strong',
      analysisStatus: 'PENDING',
      embedding: [1, 0, 0],
      createdAt: now,
    }

    expect(findBestMatch([1, 0, 0], [weak, strong], now)).toEqual(strong)
  })
})

describe('buildEmbeddingInput', () => {
  it('combines title and excerpt when an excerpt is present', () => {
    expect(buildEmbeddingInput({ title: 'Headline', excerpt: 'More detail.' })).toBe('Headline\nMore detail.')
  })

  it('falls back to the title alone when there is no excerpt', () => {
    expect(buildEmbeddingInput({ title: 'Headline' })).toBe('Headline')
  })
})
