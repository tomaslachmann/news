import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CoverageStatus } from '../repositories/coverage.js'

const { mockExtractEntitiesAndLinkStoryRelations } = vi.hoisted(() => ({
  mockExtractEntitiesAndLinkStoryRelations: vi.fn(),
}))

vi.mock('../services/storyRelationPass.js', () => ({
  extractEntitiesAndLinkStoryRelations: mockExtractEntitiesAndLinkStoryRelations,
}))

import { runEntityRelationJob, deriveSourceTexts } from './entityRelationJob.js'

const STORY = {
  anchorHeadline: 'Anchor headline',
  createdAt: new Date('2026-01-15T00:00:00Z'),
  embedding: [1, 0, 0],
}

function coverage(
  overrides: Partial<{ title: string | null; extractedText: string | null; status: CoverageStatus }>
) {
  return { title: null, extractedText: null, status: 'PENDING' as CoverageStatus, ...overrides }
}

describe('deriveSourceTexts', () => {
  it('uses extractedText when present, regardless of status', () => {
    const texts = deriveSourceTexts(
      [coverage({ extractedText: 'full text', title: 'a title', status: 'OK' })],
      STORY,
      'coverage-confirmation'
    )
    expect(texts).toEqual(['full text'])
  })

  it('falls back to title when there is no extractedText and status is not EXTRACTION_FAILED', () => {
    const texts = deriveSourceTexts(
      [coverage({ title: 'RSS title', status: 'PENDING' })],
      STORY,
      'draft-approval'
    )
    expect(texts).toEqual([STORY.anchorHeadline, 'RSS title'])
  })

  it('skips a Coverage with no extractedText whose status is EXTRACTION_FAILED, even if it has a title', () => {
    const texts = deriveSourceTexts(
      [coverage({ title: 'blocked article title', status: 'EXTRACTION_FAILED' })],
      STORY,
      'coverage-confirmation'
    )
    expect(texts).toEqual([])
  })

  it('prepends story.anchorHeadline only for draft-approval, never for coverage-confirmation', () => {
    const coverages = [coverage({ extractedText: 'text' })]
    expect(deriveSourceTexts(coverages, STORY, 'draft-approval')).toEqual([STORY.anchorHeadline, 'text'])
    expect(deriveSourceTexts(coverages, STORY, 'coverage-confirmation')).toEqual(['text'])
  })

  it('skips a Coverage with neither extractedText nor title', () => {
    const texts = deriveSourceTexts([coverage({ status: 'PENDING' })], STORY, 'coverage-confirmation')
    expect(texts).toEqual([])
  })
})

describe('runEntityRelationJob', () => {
  beforeEach(() => vi.resetAllMocks())

  const baseDeps = {
    replaceStoryEntities: vi.fn(),
    findStoryEntitiesForScoring: vi.fn(),
    countStories: vi.fn(),
    findRelationCandidateStories: vi.fn(),
    createStoryRelation: vi.fn(),
  }

  it('logs and returns without calling extractEntitiesAndLinkStoryRelations when the Analysis no longer exists', async () => {
    const findAnalysisWithStory = vi.fn().mockResolvedValue(null)
    const findCoveragesForAnalysis = vi.fn().mockResolvedValue([])
    const log = { warn: vi.fn(), error: vi.fn() }

    await runEntityRelationJob(
      { analysisId: 'gone', origin: 'draft-approval' },
      { ...baseDeps, findAnalysisWithStory, findCoveragesForAnalysis },
      log as never
    )

    expect(mockExtractEntitiesAndLinkStoryRelations).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ analysisId: 'gone' }), expect.any(String))
  })

  it('derives source texts from Coverage state and runs the pipeline against the Analysis storyId', async () => {
    const findAnalysisWithStory = vi.fn().mockResolvedValue({ storyId: 'story-1', story: STORY })
    const findCoveragesForAnalysis = vi
      .fn()
      .mockResolvedValue([coverage({ extractedText: 'scraped text', status: 'OK' })])
    mockExtractEntitiesAndLinkStoryRelations.mockResolvedValue(undefined)

    await runEntityRelationJob(
      { analysisId: 'a1', origin: 'coverage-confirmation' },
      { ...baseDeps, findAnalysisWithStory, findCoveragesForAnalysis }
    )

    expect(mockExtractEntitiesAndLinkStoryRelations).toHaveBeenCalledWith(
      'story-1',
      ['scraped text'],
      STORY,
      expect.objectContaining(baseDeps),
      undefined
    )
  })

  it('propagates a retryable failure from the pipeline rather than swallowing it', async () => {
    const findAnalysisWithStory = vi.fn().mockResolvedValue({ storyId: 'story-1', story: STORY })
    const findCoveragesForAnalysis = vi.fn().mockResolvedValue([])
    mockExtractEntitiesAndLinkStoryRelations.mockRejectedValue(new Error('LLM outage'))

    await expect(
      runEntityRelationJob(
        { analysisId: 'a1', origin: 'draft-approval' },
        { ...baseDeps, findAnalysisWithStory, findCoveragesForAnalysis }
      )
    ).rejects.toThrow('LLM outage')
  })

  it('still treats a genuinely-gone Analysis as permanent (warn + return) even when the concurrent Coverage fetch also fails', async () => {
    const findAnalysisWithStory = vi.fn().mockResolvedValue(null)
    const findCoveragesForAnalysis = vi.fn().mockRejectedValue(new Error('pool exhausted'))
    const log = { warn: vi.fn(), error: vi.fn() }

    await runEntityRelationJob(
      { analysisId: 'gone', origin: 'draft-approval' },
      { ...baseDeps, findAnalysisWithStory, findCoveragesForAnalysis },
      log as never
    )

    expect(mockExtractEntitiesAndLinkStoryRelations).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ analysisId: 'gone' }), expect.any(String))
  })

  it('propagates a Coverage-fetch failure as retryable when the Analysis does exist', async () => {
    const findAnalysisWithStory = vi.fn().mockResolvedValue({ storyId: 'story-1', story: STORY })
    const findCoveragesForAnalysis = vi.fn().mockRejectedValue(new Error('pool exhausted'))

    await expect(
      runEntityRelationJob(
        { analysisId: 'a1', origin: 'draft-approval' },
        { ...baseDeps, findAnalysisWithStory, findCoveragesForAnalysis }
      )
    ).rejects.toThrow('pool exhausted')

    expect(mockExtractEntitiesAndLinkStoryRelations).not.toHaveBeenCalled()
  })
})
