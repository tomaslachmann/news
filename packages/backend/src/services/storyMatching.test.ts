import { describe, it, expect } from 'vitest'
import { cosineSimilarity, findBestMatch, buildEmbeddingInput, DEDUP_WINDOW_HOURS } from './storyMatching.js'

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

describe('findBestMatch', () => {
  const now = new Date('2026-01-02T00:00:00Z')

  function hoursAgo(hours: number): Date {
    return new Date(now.getTime() - hours * 60 * 60 * 1000)
  }

  it('returns the matching candidate when similarity clears the threshold', () => {
    const candidate = {
      storyId: 's1',
      analysisId: 'a1',
      analysisStatus: 'PENDING',
      anchorHeadline: 'Anchor headline',
      headline: null,
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
      anchorHeadline: 'Anchor headline',
      headline: null,
      embedding: [0, 1, 0],
      createdAt: now,
    }

    expect(findBestMatch([1, 0, 0], [candidate], now)).toBeNull()
  })

  it('returns null for an empty candidate list', () => {
    expect(findBestMatch([1, 0, 0], [], now)).toBeNull()
  })

  // P1-7 (docs/audit.md, ADR 0025): the score used to be similarity × a multiplicative
  // time-decay factor, which silently shrank the *effective* matchable window to ~26-34h even
  // though DEDUP_WINDOW_HOURS declares 48h — a candidate at 47h old with perfect similarity
  // would previously fail to clear MATCH_THRESHOLD. Score is now plain cosine similarity, so
  // age within the window no longer affects whether a match clears the threshold at all.
  it('matches a candidate near the edge of the window with perfect similarity, unlike the old decay-based score', () => {
    const nearEdgeOfWindow = {
      storyId: 's1',
      analysisId: 'a1',
      analysisStatus: 'PENDING',
      anchorHeadline: 'Anchor headline',
      headline: null,
      embedding: [1, 0, 0],
      createdAt: hoursAgo(DEDUP_WINDOW_HOURS - 1),
    }

    expect(findBestMatch([1, 0, 0], [nearEdgeOfWindow], now)).toEqual(nearEdgeOfWindow)
  })

  it('excludes a candidate older than DEDUP_WINDOW_HOURS regardless of similarity — a hard boundary, not a discount', () => {
    const justPastTheWindow = {
      storyId: 's1',
      analysisId: 'a1',
      analysisStatus: 'PENDING',
      anchorHeadline: 'Anchor headline',
      headline: null,
      embedding: [1, 0, 0],
      createdAt: hoursAgo(DEDUP_WINDOW_HOURS + 1),
    }

    expect(findBestMatch([1, 0, 0], [justPastTheWindow], now)).toBeNull()
  })

  it('excludes a very old candidate outright, independent of the boundary case above', () => {
    const veryOld = {
      storyId: 's1',
      analysisId: 'a1',
      analysisStatus: 'PENDING',
      anchorHeadline: 'Anchor headline',
      headline: null,
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
      anchorHeadline: 'Anchor headline',
      headline: null,
      embedding: [0.8, 0.2, 0],
      createdAt: now,
    }
    const strong = {
      storyId: 's-strong',
      analysisId: 'a-strong',
      analysisStatus: 'PENDING',
      anchorHeadline: 'Anchor headline',
      headline: null,
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

  // P1-8 (docs/audit.md, ADR 0025): both call sites already went through this one function, but
  // an RSS teaser and several sentences of Readability-extracted prose are different enough
  // distributions that a cross-path match was systematically weaker than a same-path one.
  it('normalizes internal whitespace/newlines in both title and excerpt', () => {
    expect(buildEmbeddingInput({ title: '  Headline\nwith  line break', excerpt: 'a\n\nb   c' })).toBe(
      'Headline with line break\na b c'
    )
  })

  it('falls back to the title alone when the excerpt is a caption-style boilerplate line (a photo/video/ad caption carries no event signal)', () => {
    expect(buildEmbeddingInput({ title: 'Headline', excerpt: 'Foto: Popisek fotografie.' })).toBe('Headline')
    expect(buildEmbeddingInput({ title: 'Headline', excerpt: 'Video: Something happened.' })).toBe('Headline')
    expect(buildEmbeddingInput({ title: 'Headline', excerpt: 'Reklama: Buy now' })).toBe('Headline')
  })

  it('caps the excerpt length so one outlier-long excerpt cannot dominate the embedding input', () => {
    const longExcerpt = 'x'.repeat(1000)

    const result = buildEmbeddingInput({ title: 'Headline', excerpt: longExcerpt })

    expect(result.length).toBeLessThan(1000)
    expect(result).toBe(`Headline\n${'x'.repeat(400)}`)
  })
})
