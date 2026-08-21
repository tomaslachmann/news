import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ExternalServiceError } from '../errors.js'

const { mockRunNarrativePass, mockSearchWikimediaImageByQuery } = vi.hoisted(() => ({
  mockRunNarrativePass: vi.fn(),
  mockSearchWikimediaImageByQuery: vi.fn(),
}))

vi.mock('../services/narrativePass.js', () => ({
  runNarrativePass: mockRunNarrativePass,
}))

vi.mock('../services/wikimediaImageClient.js', () => ({
  searchWikimediaImageByQuery: mockSearchWikimediaImageByQuery,
}))

import { runNarrativeJob, buildNarrativeSources } from './narrativeJob.js'

const DIMENSIONS = { agreement: [], contradiction: [], uniqueReporting: [], framing: [] }

const OK_COVERAGE = {
  status: 'OK' as const,
  extractedText: 'Plný text článku.',
  source: { name: 'iDnes' },
  articleUrl: 'https://idnes.cz/x',
}

const DOCUMENT = {
  version: 1 as const,
  blocks: [
    { type: 'paragraph' as const, children: [{ type: 'text' as const, text: 'Kombinovaná zpráva.' }] },
  ],
  assertions: [],
  entityRefs: [],
  sourceRefs: [],
  valueRefs: [],
}

const IMAGE = {
  externalId: 'Prague Castle.jpg',
  imageUrl: 'https://upload.wikimedia.org/full/Prague_Castle.jpg',
  thumbnailUrl: 'https://upload.wikimedia.org/thumb/Prague_Castle.jpg',
  author: 'Jane Doe',
  license: 'CC BY-SA 4.0',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Prague_Castle.jpg',
  width: 6000,
  height: 4000,
}

function analysis(
  overrides: Partial<{
    coverages: unknown[]
    synthesisResult: unknown
    storyId: string
    seedHeadline: string
  }> = {}
) {
  return {
    id: 'a1',
    storyId: 's1',
    seedHeadline: 'Seed headline',
    coverages: [OK_COVERAGE],
    synthesisResult: {
      id: 'sr1',
      analysisId: 'a1',
      dimensions: DIMENSIONS,
      narrative: null,
      headline: 'Generated headline',
    },
    ...overrides,
  }
}

describe('buildNarrativeSources', () => {
  it('includes only OK Coverage with extractedText', () => {
    const sources = buildNarrativeSources([
      OK_COVERAGE,
      { status: 'EXTRACTION_FAILED' as const, extractedText: null, source: { name: 'X' }, articleUrl: 'u' },
      { status: 'OK' as const, extractedText: null, source: { name: 'Y' }, articleUrl: 'u2' },
    ])
    expect(sources).toEqual([
      { outlet: 'iDnes', articleUrl: 'https://idnes.cz/x', fullText: 'Plný text článku.' },
    ])
  })
})

describe('runNarrativeJob', () => {
  beforeEach(() => vi.resetAllMocks())

  const baseDeps = {
    findEntityMentionsForStory: vi.fn().mockResolvedValue([]),
    updateSynthesisResultNarrative: vi.fn(),
    markNarrativeGenerationFailedSafe: vi.fn(),
    findNarrativeImageForSynthesisResult: vi.fn().mockResolvedValue(null),
    createNarrativeImage: vi.fn(),
  }

  beforeEach(() => {
    mockSearchWikimediaImageByQuery.mockResolvedValue(null)
    baseDeps.findEntityMentionsForStory.mockResolvedValue([])
    baseDeps.findNarrativeImageForSynthesisResult.mockResolvedValue(null)
  })

  it('logs and returns without generating when the Analysis no longer exists', async () => {
    const findAnalysisWithDetails = vi.fn().mockResolvedValue(null)
    const log = { warn: vi.fn(), error: vi.fn() }

    await runNarrativeJob({ analysisId: 'gone' }, { ...baseDeps, findAnalysisWithDetails }, log as never)

    expect(mockRunNarrativePass).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ analysisId: 'gone' }), expect.any(String))
  })

  it('logs and returns without generating when the Analysis has no SynthesisResult', async () => {
    const findAnalysisWithDetails = vi.fn().mockResolvedValue(analysis({ synthesisResult: null }))
    const log = { warn: vi.fn(), error: vi.fn() }

    await runNarrativeJob({ analysisId: 'a1' }, { ...baseDeps, findAnalysisWithDetails }, log as never)

    expect(mockRunNarrativePass).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalled()
  })

  it('logs and returns without generating when there is no eligible source text', async () => {
    const findAnalysisWithDetails = vi.fn().mockResolvedValue(analysis({ coverages: [] }))
    const log = { warn: vi.fn(), error: vi.fn() }

    await runNarrativeJob({ analysisId: 'a1' }, { ...baseDeps, findAnalysisWithDetails }, log as never)

    expect(mockRunNarrativePass).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalled()
  })

  it('logs and returns without regenerating when a narrative is already present (redelivered job)', async () => {
    const findAnalysisWithDetails = vi.fn().mockResolvedValue(
      analysis({
        synthesisResult: { analysisId: 'a1', dimensions: DIMENSIONS, narrative: { version: 1, blocks: [] } },
      })
    )
    const log = { warn: vi.fn(), error: vi.fn() }

    await runNarrativeJob({ analysisId: 'a1' }, { ...baseDeps, findAnalysisWithDetails }, log as never)

    expect(mockRunNarrativePass).not.toHaveBeenCalled()
    expect(baseDeps.updateSynthesisResultNarrative).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalled()
  })

  it('generates and persists the narrative from Coverage text, cached Dimensions and the Story entity list', async () => {
    const findAnalysisWithDetails = vi.fn().mockResolvedValue(analysis())
    const findEntityMentionsForStory = vi
      .fn()
      .mockResolvedValue([
        { key: 'person:petr-fiala', canonicalName: 'Petr Fiala', type: 'PERSON', imageUrl: null },
      ])
    mockRunNarrativePass.mockResolvedValue(DOCUMENT)

    await runNarrativeJob(
      { analysisId: 'a1' },
      { ...baseDeps, findAnalysisWithDetails, findEntityMentionsForStory }
    )

    expect(findEntityMentionsForStory).toHaveBeenCalledWith('s1')
    expect(mockRunNarrativePass).toHaveBeenCalledWith(
      [{ outlet: 'iDnes', articleUrl: 'https://idnes.cz/x', fullText: 'Plný text článku.' }],
      DIMENSIONS,
      [{ key: 'person:petr-fiala', canonicalName: 'Petr Fiala', type: 'PERSON', imageUrl: null }],
      undefined
    )
    expect(baseDeps.updateSynthesisResultNarrative).toHaveBeenCalledWith('a1', DOCUMENT)
    expect(baseDeps.markNarrativeGenerationFailedSafe).not.toHaveBeenCalled()
  })

  it('selects and persists an illustrative lead image, searching by the generated headline', async () => {
    const findAnalysisWithDetails = vi.fn().mockResolvedValue(analysis())
    mockRunNarrativePass.mockResolvedValue(DOCUMENT)
    mockSearchWikimediaImageByQuery.mockResolvedValue(IMAGE)

    await runNarrativeJob({ analysisId: 'a1' }, { ...baseDeps, findAnalysisWithDetails })

    expect(mockSearchWikimediaImageByQuery).toHaveBeenCalledWith('Generated headline')
    expect(baseDeps.createNarrativeImage).toHaveBeenCalledWith({
      synthesisResultId: 'sr1',
      provider: 'WIKIMEDIA',
      ...IMAGE,
    })
  })

  it('falls back to the seed headline as the image search query when no headline was generated', async () => {
    const findAnalysisWithDetails = vi.fn().mockResolvedValue(
      analysis({
        synthesisResult: {
          id: 'sr1',
          analysisId: 'a1',
          dimensions: DIMENSIONS,
          narrative: null,
          headline: null,
        },
      })
    )
    mockRunNarrativePass.mockResolvedValue(DOCUMENT)

    await runNarrativeJob({ analysisId: 'a1' }, { ...baseDeps, findAnalysisWithDetails })

    expect(mockSearchWikimediaImageByQuery).toHaveBeenCalledWith('Seed headline')
  })

  it('falls back to the Story entities in order when the headline search finds nothing', async () => {
    const findAnalysisWithDetails = vi.fn().mockResolvedValue(analysis())
    const findEntityMentionsForStory = vi.fn().mockResolvedValue([
      { key: 'place:uvaly', canonicalName: 'Úvaly', type: 'PLACE', imageUrl: null },
      { key: 'place:praha', canonicalName: 'Praha', type: 'PLACE', imageUrl: null },
    ])
    mockRunNarrativePass.mockResolvedValue(DOCUMENT)
    mockSearchWikimediaImageByQuery
      .mockResolvedValueOnce(null) // headline
      .mockResolvedValueOnce(IMAGE) // first entity

    await runNarrativeJob(
      { analysisId: 'a1' },
      { ...baseDeps, findAnalysisWithDetails, findEntityMentionsForStory }
    )

    expect(mockSearchWikimediaImageByQuery).toHaveBeenNthCalledWith(1, 'Generated headline')
    expect(mockSearchWikimediaImageByQuery).toHaveBeenNthCalledWith(2, 'Úvaly')
    expect(mockSearchWikimediaImageByQuery).toHaveBeenCalledTimes(2)
    expect(baseDeps.createNarrativeImage).toHaveBeenCalledWith({
      synthesisResultId: 'sr1',
      provider: 'WIKIMEDIA',
      ...IMAGE,
    })
  })

  it('caps entity-name fallback candidates rather than trying every Story entity', async () => {
    const findAnalysisWithDetails = vi.fn().mockResolvedValue(analysis())
    const findEntityMentionsForStory = vi.fn().mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => ({
        key: `place:e${i}`,
        canonicalName: `Entity ${i}`,
        type: 'PLACE' as const,
        imageUrl: null,
      }))
    )
    mockRunNarrativePass.mockResolvedValue(DOCUMENT)
    mockSearchWikimediaImageByQuery.mockResolvedValue(null)

    await runNarrativeJob(
      { analysisId: 'a1' },
      { ...baseDeps, findAnalysisWithDetails, findEntityMentionsForStory }
    )

    // 1 headline + at most 5 entity fallbacks, not all 8 Story entities.
    expect(mockSearchWikimediaImageByQuery).toHaveBeenCalledTimes(6)
  })

  it('completes with no lead image, no throw, and no failure mark when the image search fails', async () => {
    const findAnalysisWithDetails = vi.fn().mockResolvedValue(analysis())
    mockRunNarrativePass.mockResolvedValue(DOCUMENT)
    mockSearchWikimediaImageByQuery.mockRejectedValue(new Error('Commons is down'))
    const log = { warn: vi.fn(), error: vi.fn(), info: vi.fn() }

    await expect(
      runNarrativeJob({ analysisId: 'a1' }, { ...baseDeps, findAnalysisWithDetails }, log as never)
    ).resolves.toBeUndefined()

    expect(baseDeps.createNarrativeImage).not.toHaveBeenCalled()
    expect(baseDeps.markNarrativeGenerationFailedSafe).not.toHaveBeenCalled()
  })

  it('completes with no throw and no failure mark when checking for an existing lead image fails', async () => {
    const findAnalysisWithDetails = vi.fn().mockResolvedValue(analysis())
    mockRunNarrativePass.mockResolvedValue(DOCUMENT)
    const findNarrativeImageForSynthesisResult = vi.fn().mockRejectedValue(new Error('DB down'))

    await expect(
      runNarrativeJob(
        { analysisId: 'a1' },
        { ...baseDeps, findAnalysisWithDetails, findNarrativeImageForSynthesisResult }
      )
    ).resolves.toBeUndefined()

    expect(mockSearchWikimediaImageByQuery).not.toHaveBeenCalled()
    expect(baseDeps.markNarrativeGenerationFailedSafe).not.toHaveBeenCalled()
  })

  it('completes with no throw and no failure mark when persisting the found lead image fails', async () => {
    const findAnalysisWithDetails = vi.fn().mockResolvedValue(analysis())
    mockRunNarrativePass.mockResolvedValue(DOCUMENT)
    mockSearchWikimediaImageByQuery.mockResolvedValue(IMAGE)
    const createNarrativeImage = vi.fn().mockRejectedValue(new Error('DB down'))

    await expect(
      runNarrativeJob({ analysisId: 'a1' }, { ...baseDeps, findAnalysisWithDetails, createNarrativeImage })
    ).resolves.toBeUndefined()

    expect(baseDeps.markNarrativeGenerationFailedSafe).not.toHaveBeenCalled()
    expect(baseDeps.updateSynthesisResultNarrative).toHaveBeenCalledWith('a1', DOCUMENT)
  })

  it('skips the image search when a lead image is already present for this SynthesisResult', async () => {
    const findAnalysisWithDetails = vi.fn().mockResolvedValue(analysis())
    mockRunNarrativePass.mockResolvedValue(DOCUMENT)
    const findNarrativeImageForSynthesisResult = vi.fn().mockResolvedValue({ id: 'img-1' })

    await runNarrativeJob(
      { analysisId: 'a1' },
      { ...baseDeps, findAnalysisWithDetails, findNarrativeImageForSynthesisResult }
    )

    expect(mockSearchWikimediaImageByQuery).not.toHaveBeenCalled()
    expect(baseDeps.createNarrativeImage).not.toHaveBeenCalled()
  })

  it('marks the failure and rethrows as retryable when generation throws', async () => {
    const findAnalysisWithDetails = vi.fn().mockResolvedValue(analysis())
    mockRunNarrativePass.mockRejectedValue(new Error('LLM down'))

    await expect(
      runNarrativeJob({ analysisId: 'a1' }, { ...baseDeps, findAnalysisWithDetails })
    ).rejects.toThrow(ExternalServiceError)

    expect(baseDeps.markNarrativeGenerationFailedSafe).toHaveBeenCalledWith('a1')
    expect(baseDeps.updateSynthesisResultNarrative).not.toHaveBeenCalled()
  })

  it('does not cache a document with no blocks, logging and marking it a retryable failure instead', async () => {
    const findAnalysisWithDetails = vi.fn().mockResolvedValue(analysis())
    mockRunNarrativePass.mockResolvedValue({ ...DOCUMENT, blocks: [] })
    const log = { warn: vi.fn(), error: vi.fn() }

    await expect(
      runNarrativeJob({ analysisId: 'a1' }, { ...baseDeps, findAnalysisWithDetails }, log as never)
    ).rejects.toThrow(ExternalServiceError)

    expect(baseDeps.updateSynthesisResultNarrative).not.toHaveBeenCalled()
    expect(baseDeps.markNarrativeGenerationFailedSafe).toHaveBeenCalledWith('a1')
    expect(log.error).toHaveBeenCalledWith({ analysisId: 'a1' }, expect.any(String))
  })

  it('marks the failure and rethrows as retryable when persisting the generated narrative fails', async () => {
    const findAnalysisWithDetails = vi.fn().mockResolvedValue(analysis())
    mockRunNarrativePass.mockResolvedValue(DOCUMENT)
    const updateSynthesisResultNarrative = vi.fn().mockRejectedValue(new Error('DB down'))

    await expect(
      runNarrativeJob(
        { analysisId: 'a1' },
        { ...baseDeps, findAnalysisWithDetails, updateSynthesisResultNarrative }
      )
    ).rejects.toThrow(ExternalServiceError)

    expect(baseDeps.markNarrativeGenerationFailedSafe).toHaveBeenCalledWith('a1')
  })

  it('marks the failure and rethrows as retryable when fetching the Story entity list fails', async () => {
    const findAnalysisWithDetails = vi.fn().mockResolvedValue(analysis())
    const findEntityMentionsForStory = vi.fn().mockRejectedValue(new Error('DB down'))

    await expect(
      runNarrativeJob(
        { analysisId: 'a1' },
        { ...baseDeps, findAnalysisWithDetails, findEntityMentionsForStory }
      )
    ).rejects.toThrow(ExternalServiceError)

    expect(mockRunNarrativePass).not.toHaveBeenCalled()
    expect(baseDeps.markNarrativeGenerationFailedSafe).toHaveBeenCalledWith('a1')
  })
})
