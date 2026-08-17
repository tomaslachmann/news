import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as analysisRepo from '../repositories/analysis.js'
import * as coverageRepo from '../repositories/coverage.js'
import * as synthesisResultRepo from '../repositories/synthesisResult.js'
import * as articleScraperModule from './articleScraper.js'
import * as keywordExtractorModule from './keywordExtractor.js'
import * as discoveryModule from './discovery.js'
import * as narrativePassModule from './narrativePass.js'
import * as storyVerificationModule from './storyVerification.js'
import * as embeddingClientModule from './embeddingClient.js'
import * as ingestionServiceModule from './ingestionService.js'
import {
  createAnalysis,
  attachSeedToMatch,
  discoverSources,
  confirmCoverages,
  getAnalysisDetail,
  listAnalyses,
} from './analysisService.js'
import { ExternalServiceError, NotFoundError, ValidationError } from '../errors.js'

vi.mock('../repositories/analysis.js')
vi.mock('../repositories/coverage.js')
vi.mock('../repositories/synthesisResult.js')
vi.mock('./articleScraper.js')
vi.mock('./keywordExtractor.js')
vi.mock('./discovery.js')
vi.mock('./narrativePass.js')
vi.mock('./storyVerification.js')
vi.mock('./embeddingClient.js')
vi.mock('./ingestionService.js')

const SCRAPED = { title: 'Headline', excerpt: 'excerpt', fullText: 'full text' }
const SEED_EMBEDDING = [1, 0, 0]

function stubScrapeAndEmbedding() {
  vi.mocked(articleScraperModule.scrapeArticle).mockResolvedValue(SCRAPED)
  vi.mocked(embeddingClientModule.generateEmbedding).mockResolvedValue(SEED_EMBEDDING)
  vi.mocked(analysisRepo.findRecentStoriesForMatching).mockResolvedValue([])
}

describe('createAnalysis', () => {
  beforeEach(() => vi.resetAllMocks())

  it('scrapes the seed article, extracts keywords, and creates the Analysis with its embedding when nothing matches', async () => {
    stubScrapeAndEmbedding()
    vi.mocked(keywordExtractorModule.extractKeywords).mockResolvedValue(['keyword1', 'keyword2'])
    vi.mocked(analysisRepo.createAnalysis).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'https://example.cz/x',
      seedHeadline: 'Headline',
      status: 'PENDING',
      createdAt: new Date(),
    })

    const result = await createAnalysis('https://example.cz/x')

    expect(result).toEqual({
      outcome: 'created',
      id: 'a1',
      seedHeadline: 'Headline',
      keywords: ['keyword1', 'keyword2'],
    })
    expect(analysisRepo.createAnalysis).toHaveBeenCalledWith({
      seedUrl: 'https://example.cz/x',
      seedHeadline: 'Headline',
      embedding: SEED_EMBEDDING,
    })
  })

  it('throws ExternalServiceError when scraping fails', async () => {
    vi.mocked(articleScraperModule.scrapeArticle).mockRejectedValue(new Error('network down'))

    await expect(createAnalysis('https://example.cz/x')).rejects.toThrow(ExternalServiceError)
  })

  it('throws ExternalServiceError when keyword extraction fails', async () => {
    stubScrapeAndEmbedding()
    vi.mocked(keywordExtractorModule.extractKeywords).mockRejectedValue(new Error('LLM down'))

    await expect(createAnalysis('https://example.cz/x')).rejects.toThrow(ExternalServiceError)
  })

  it('degrades gracefully and skips the dedup check when embedding generation fails, instead of blocking submission', async () => {
    vi.mocked(articleScraperModule.scrapeArticle).mockResolvedValue(SCRAPED)
    vi.mocked(embeddingClientModule.generateEmbedding).mockRejectedValue(new Error('embeddings API down'))
    vi.mocked(keywordExtractorModule.extractKeywords).mockResolvedValue(['keyword1'])
    vi.mocked(analysisRepo.createAnalysis).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'https://example.cz/x',
      seedHeadline: 'Headline',
      status: 'PENDING',
      createdAt: new Date(),
    })

    const result = await createAnalysis('https://example.cz/x')

    expect(result.outcome).toBe('created')
    expect(analysisRepo.findRecentStoriesForMatching).not.toHaveBeenCalled()
    expect(analysisRepo.createAnalysis).toHaveBeenCalledWith({
      seedUrl: 'https://example.cz/x',
      seedHeadline: 'Headline',
      embedding: [],
    })
  })

  it('returns a matched outcome instead of creating a new Analysis when a same-event match is confirmed', async () => {
    stubScrapeAndEmbedding()
    vi.mocked(analysisRepo.findRecentStoriesForMatching).mockResolvedValue([
      {
        storyId: 's1',
        analysisId: 'existing-1',
        analysisStatus: 'PENDING',
        embedding: SEED_EMBEDDING,
        createdAt: new Date(),
        anchorHeadline: 'Existing headline',
        headline: null,
      },
    ])
    vi.mocked(storyVerificationModule.verifySameStoryLogged).mockResolvedValue({
      sameEvent: true,
      reasoning: 'Same event',
    })

    const result = await createAnalysis('https://example.cz/x')

    expect(result).toEqual({
      outcome: 'matched',
      id: 'existing-1',
      title: 'Existing headline',
      matchedStatus: 'pending',
    })
    expect(analysisRepo.createAnalysis).not.toHaveBeenCalled()
    expect(keywordExtractorModule.extractKeywords).not.toHaveBeenCalled()
  })

  it('returns the generated headline as the title when the matched Analysis is already COMPLETE', async () => {
    stubScrapeAndEmbedding()
    vi.mocked(analysisRepo.findRecentStoriesForMatching).mockResolvedValue([
      {
        storyId: 's1',
        analysisId: 'existing-1',
        analysisStatus: 'COMPLETE',
        embedding: SEED_EMBEDDING,
        createdAt: new Date(),
        anchorHeadline: 'Existing headline',
        headline: 'Generated headline',
      },
    ])
    vi.mocked(storyVerificationModule.verifySameStoryLogged).mockResolvedValue({
      sameEvent: true,
      reasoning: 'Same event',
    })

    const result = await createAnalysis('https://example.cz/x')

    expect(result).toEqual({
      outcome: 'matched',
      id: 'existing-1',
      title: 'Generated headline',
      matchedStatus: 'complete',
    })
  })

  it('creates a new Analysis when the embedding match is rejected by the LLM confirmation', async () => {
    stubScrapeAndEmbedding()
    vi.mocked(analysisRepo.findRecentStoriesForMatching).mockResolvedValue([
      {
        storyId: 's1',
        analysisId: 'existing-1',
        analysisStatus: 'PENDING',
        embedding: SEED_EMBEDDING,
        createdAt: new Date(),
        anchorHeadline: 'Unrelated headline',
        headline: null,
      },
    ])
    vi.mocked(storyVerificationModule.verifySameStoryLogged).mockResolvedValue({
      sameEvent: false,
      reasoning: 'Different event',
    })
    vi.mocked(keywordExtractorModule.extractKeywords).mockResolvedValue(['keyword1'])
    vi.mocked(analysisRepo.createAnalysis).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'https://example.cz/x',
      seedHeadline: 'Headline',
      status: 'PENDING',
      createdAt: new Date(),
    })

    const result = await createAnalysis('https://example.cz/x')

    expect(result.outcome).toBe('created')
  })

  it('treats a FAILED match as no match at all, rather than skipping submission', async () => {
    stubScrapeAndEmbedding()
    vi.mocked(analysisRepo.findRecentStoriesForMatching).mockResolvedValue([
      {
        storyId: 's1',
        analysisId: 'existing-1',
        analysisStatus: 'FAILED',
        embedding: SEED_EMBEDDING,
        createdAt: new Date(),
        anchorHeadline: 'A previously failed analysis',
        headline: null,
      },
    ])
    vi.mocked(keywordExtractorModule.extractKeywords).mockResolvedValue(['keyword1'])
    vi.mocked(analysisRepo.createAnalysis).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'https://example.cz/x',
      seedHeadline: 'Headline',
      status: 'PENDING',
      createdAt: new Date(),
    })

    const result = await createAnalysis('https://example.cz/x')

    expect(result.outcome).toBe('created')
    expect(storyVerificationModule.verifySameStoryLogged).not.toHaveBeenCalled()
  })

  it('skips the dedup check entirely when force is true, even if a match would have been found', async () => {
    stubScrapeAndEmbedding()
    vi.mocked(keywordExtractorModule.extractKeywords).mockResolvedValue(['keyword1'])
    vi.mocked(analysisRepo.createAnalysis).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'https://example.cz/x',
      seedHeadline: 'Headline',
      status: 'PENDING',
      createdAt: new Date(),
    })

    const result = await createAnalysis('https://example.cz/x', { force: true })

    expect(result.outcome).toBe('created')
    expect(analysisRepo.findRecentStoriesForMatching).not.toHaveBeenCalled()
    expect(storyVerificationModule.verifySameStoryLogged).not.toHaveBeenCalled()
  })
})

describe('attachSeedToMatch', () => {
  beforeEach(() => vi.resetAllMocks())

  it('throws NotFoundError when the Analysis does not exist', async () => {
    vi.mocked(analysisRepo.findAnalysisById).mockResolvedValue(null)

    await expect(attachSeedToMatch('missing', 'https://example.cz/x')).rejects.toThrow(NotFoundError)
  })

  it('throws ValidationError for an Analysis that is not DRAFT or PENDING', async () => {
    vi.mocked(analysisRepo.findAnalysisById).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'x',
      seedHeadline: 'x',
      status: 'COMPLETE',
      createdAt: new Date(),
    })

    await expect(attachSeedToMatch('a1', 'https://example.cz/x')).rejects.toThrow(ValidationError)
  })

  it('attaches the seed as Coverage to a PENDING Analysis without approving anything', async () => {
    vi.mocked(analysisRepo.findAnalysisById).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'x',
      seedHeadline: 'x',
      status: 'PENDING',
      createdAt: new Date(),
    })
    vi.mocked(articleScraperModule.scrapeArticle).mockResolvedValue(SCRAPED)
    vi.mocked(discoveryModule.extractDomain).mockReturnValue('example.cz')
    vi.mocked(coverageRepo.findCoveragesForAnalysis).mockResolvedValue([])

    await attachSeedToMatch('a1', 'https://example.cz/x')

    expect(coverageRepo.createCoverages).toHaveBeenCalledWith([
      {
        analysisId: 'a1',
        outlet: 'example.cz',
        title: 'Headline',
        articleUrl: 'https://example.cz/x',
        status: 'PENDING',
      },
    ])
    expect(ingestionServiceModule.approveDraft).not.toHaveBeenCalled()
  })

  it('attaches the seed as Coverage and runs the approve flow for a DRAFT Analysis', async () => {
    vi.mocked(analysisRepo.findAnalysisById).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'x',
      seedHeadline: 'x',
      status: 'DRAFT',
      createdAt: new Date(),
    })
    vi.mocked(articleScraperModule.scrapeArticle).mockResolvedValue(SCRAPED)
    vi.mocked(discoveryModule.extractDomain).mockReturnValue('example.cz')
    vi.mocked(coverageRepo.findCoveragesForAnalysis).mockResolvedValue([])

    await attachSeedToMatch('a1', 'https://example.cz/x')

    expect(coverageRepo.createCoverages).toHaveBeenCalled()
    expect(ingestionServiceModule.approveDraft).toHaveBeenCalledWith('a1', undefined)
  })

  it('skips creating a duplicate Coverage when the outlet is already attached, but still approves a DRAFT', async () => {
    vi.mocked(analysisRepo.findAnalysisById).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'x',
      seedHeadline: 'x',
      status: 'DRAFT',
      createdAt: new Date(),
    })
    vi.mocked(articleScraperModule.scrapeArticle).mockResolvedValue(SCRAPED)
    vi.mocked(discoveryModule.extractDomain).mockReturnValue('example.cz')
    vi.mocked(coverageRepo.findCoveragesForAnalysis).mockResolvedValue([
      {
        id: 'c1',
        analysisId: 'a1',
        outlet: 'example.cz',
        title: null,
        articleUrl: 'https://example.cz/already-there',
        publishedAt: null,
        extractedText: null,
        extractionResult: null,
        status: 'PENDING',
        excluded: false,
      },
    ])

    await attachSeedToMatch('a1', 'https://example.cz/x')

    expect(coverageRepo.createCoverages).not.toHaveBeenCalled()
    expect(ingestionServiceModule.approveDraft).toHaveBeenCalledWith('a1', undefined)
  })

  it('throws ValidationError if the Analysis status changed between the entry check and the post-scrape re-check', async () => {
    vi.mocked(analysisRepo.findAnalysisById)
      .mockResolvedValueOnce({
        id: 'a1',
        storyId: 's1',
        seedUrl: 'x',
        seedHeadline: 'x',
        status: 'DRAFT',
        createdAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: 'a1',
        storyId: 's1',
        seedUrl: 'x',
        seedHeadline: 'x',
        status: 'FAILED',
        createdAt: new Date(),
      })
    vi.mocked(articleScraperModule.scrapeArticle).mockResolvedValue(SCRAPED)

    await expect(attachSeedToMatch('a1', 'https://example.cz/x')).rejects.toThrow(ValidationError)
    expect(coverageRepo.createCoverages).not.toHaveBeenCalled()
    expect(ingestionServiceModule.approveDraft).not.toHaveBeenCalled()
  })
})

describe('discoverSources', () => {
  beforeEach(() => vi.resetAllMocks())

  it('throws NotFoundError when the Analysis does not exist', async () => {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue(null)

    await expect(discoverSources('missing', ['keyword'])).rejects.toThrow(NotFoundError)
  })

  it('discovers candidates, verifies each against the Story, and persists the verified ones as Coverage', async () => {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'x',
      seedHeadline: 'x',
      status: 'PENDING',
      createdAt: new Date(),
      story: { id: 's1', createdAt: new Date(), anchorHeadline: 'x', embedding: [] },
    })
    vi.mocked(discoveryModule.discoverCoverage).mockResolvedValue({
      candidates: [
        { outlet: 'iDnes', title: 'T', url: 'https://idnes.cz/x', publishedAt: '2025-01-01T00:00:00Z' },
      ],
      gdeltCount: 1,
    })
    vi.mocked(storyVerificationModule.verifyCandidatesAgainstAnchor).mockImplementation((candidates) =>
      Promise.resolve(candidates)
    )

    const result = await discoverSources('a1', ['keyword'])

    expect(storyVerificationModule.verifyCandidatesAgainstAnchor).toHaveBeenCalledWith(
      [{ outlet: 'iDnes', title: 'T', url: 'https://idnes.cz/x', publishedAt: '2025-01-01T00:00:00Z' }],
      'x',
      undefined
    )
    expect(result).toHaveLength(1)
    expect(coverageRepo.createCoverages).toHaveBeenCalledWith([
      {
        analysisId: 'a1',
        outlet: 'iDnes',
        title: 'T',
        articleUrl: 'https://idnes.cz/x',
        publishedAt: '2025-01-01T00:00:00Z',
        status: 'PENDING',
      },
    ])
  })

  it('excludes a candidate that fails same-story verification', async () => {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'x',
      seedHeadline: 'x',
      status: 'PENDING',
      createdAt: new Date(),
      story: { id: 's1', createdAt: new Date(), anchorHeadline: 'x', embedding: [] },
    })
    vi.mocked(discoveryModule.discoverCoverage).mockResolvedValue({
      candidates: [
        {
          outlet: 'iDnes',
          title: 'Unrelated',
          url: 'https://idnes.cz/x',
          publishedAt: '2025-01-01T00:00:00Z',
        },
      ],
      gdeltCount: 1,
    })
    vi.mocked(storyVerificationModule.verifyCandidatesAgainstAnchor).mockResolvedValue([])

    const result = await discoverSources('a1', ['keyword'])

    expect(result).toEqual([])
    expect(coverageRepo.createCoverages).toHaveBeenCalledWith([])
  })
})

describe('confirmCoverages', () => {
  beforeEach(() => vi.resetAllMocks())

  const ANALYSIS = {
    id: 'a1',
    storyId: 's1',
    seedUrl: 'x',
    seedHeadline: 'x',
    status: 'PENDING' as const,
    createdAt: new Date(),
  }

  const PENDING_COVERAGE = {
    id: 'c1',
    analysisId: 'a1',
    outlet: 'iDnes',
    title: null,
    articleUrl: 'https://idnes.cz/x',
    publishedAt: null,
    extractedText: null,
    extractionResult: null,
    status: 'PENDING' as const,
    excluded: false,
  }

  function stubHappyPath() {
    vi.mocked(analysisRepo.findAnalysisById).mockResolvedValue(ANALYSIS)
    vi.mocked(coverageRepo.findCoverageUrlsForAnalysis).mockResolvedValue([])
    vi.mocked(coverageRepo.findCoveragesForAnalysis)
      .mockResolvedValueOnce([PENDING_COVERAGE])
      .mockResolvedValueOnce([PENDING_COVERAGE])
  }

  it('marks a Coverage extraction-failed when the scraped text matches a blocked-content phrase, even though it is long', async () => {
    stubHappyPath()
    vi.mocked(articleScraperModule.scrapeArticle).mockResolvedValue({
      title: 'Article',
      excerpt: 'excerpt',
      fullText: 'Neblokujete reklamy a vidíte tuto stránku? '.repeat(50),
    })

    await confirmCoverages('a1', { confirmedIds: ['c1'] })

    expect(coverageRepo.updateCoverage).toHaveBeenCalledWith('c1', { status: 'EXTRACTION_FAILED' })
  })

  it('marks a Coverage ok when the scraped text is ordinary article content', async () => {
    stubHappyPath()
    const fullText = 'A perfectly ordinary article body with plenty of real content in it. '.repeat(10)
    vi.mocked(articleScraperModule.scrapeArticle).mockResolvedValue({
      title: 'Article',
      excerpt: 'excerpt',
      fullText,
    })

    await confirmCoverages('a1', { confirmedIds: ['c1'] })

    expect(coverageRepo.updateCoverage).toHaveBeenCalledWith('c1', { extractedText: fullText, status: 'OK' })
  })
})

describe('getAnalysisDetail', () => {
  beforeEach(() => vi.resetAllMocks())

  const OK_COVERAGE = {
    id: 'c1',
    analysisId: 'a1',
    outlet: 'iDnes',
    title: null,
    articleUrl: 'https://idnes.cz/x',
    publishedAt: null,
    extractedText: 'Plný text článku.',
    extractionResult: null,
    status: 'OK' as const,
    excluded: false,
  }

  const DIMENSIONS = { agreement: [], contradiction: [], uniqueReporting: [], framing: [] }

  it('throws NotFoundError when the Analysis does not exist', async () => {
    vi.mocked(analysisRepo.findAnalysisWithDetails).mockResolvedValue(null)

    await expect(getAnalysisDetail('missing')).rejects.toThrow(NotFoundError)
  })

  it('maps the Analysis, its coverages, and synthesis result to AnalysisDetail', async () => {
    vi.mocked(analysisRepo.findAnalysisWithDetails).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'https://example.cz/x',
      seedHeadline: 'Headline',
      status: 'COMPLETE',
      createdAt: new Date('2025-01-01T00:00:00Z'),
      coverages: [],
      synthesisResult: null,
    })

    const result = await getAnalysisDetail('a1')

    expect(result.status).toBe('complete')
    expect(result.coverages).toEqual([])
    expect(result.synthesisResult).toBeUndefined()
  })

  it('generates and caches the narrative when the Analysis is complete and has no narrative yet', async () => {
    vi.mocked(analysisRepo.findAnalysisWithDetails).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'https://example.cz/x',
      seedHeadline: 'Headline',
      status: 'COMPLETE',
      createdAt: new Date('2025-01-01T00:00:00Z'),
      coverages: [OK_COVERAGE],
      synthesisResult: {
        id: 's1',
        analysisId: 'a1',
        dimensions: DIMENSIONS,
        narrative: null,
        headline: null,
      },
    })
    const segments = [
      {
        prose: 'Kombinovaná zpráva.',
        attributions: [{ outlet: 'iDnes', czechQuote: 'Q', articleUrl: 'https://idnes.cz/x' }],
      },
    ]
    vi.mocked(narrativePassModule.runNarrativePass).mockResolvedValue({ segments })

    const result = await getAnalysisDetail('a1')

    expect(narrativePassModule.runNarrativePass).toHaveBeenCalledWith(
      [{ outlet: 'iDnes', articleUrl: 'https://idnes.cz/x', fullText: 'Plný text článku.' }],
      DIMENSIONS,
      undefined
    )
    expect(synthesisResultRepo.updateSynthesisResultNarrative).toHaveBeenCalledWith('a1', segments)
    expect(result.narrative).toEqual(segments)
  })

  it('does not cache an empty narrative result, so the next view can retry generation', async () => {
    vi.mocked(analysisRepo.findAnalysisWithDetails).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'https://example.cz/x',
      seedHeadline: 'Headline',
      status: 'COMPLETE',
      createdAt: new Date('2025-01-01T00:00:00Z'),
      coverages: [OK_COVERAGE],
      synthesisResult: {
        id: 's1',
        analysisId: 'a1',
        dimensions: DIMENSIONS,
        narrative: null,
        headline: null,
      },
    })
    vi.mocked(narrativePassModule.runNarrativePass).mockResolvedValue({ segments: [] })

    const result = await getAnalysisDetail('a1')

    expect(synthesisResultRepo.updateSynthesisResultNarrative).not.toHaveBeenCalled()
    expect(result.narrative).toBeUndefined()
  })

  it('does not regenerate the narrative when one is already cached', async () => {
    const cachedSegments = [
      {
        prose: 'Uloženo v mezipaměti.',
        attributions: [{ outlet: 'iDnes', czechQuote: 'Q', articleUrl: 'https://idnes.cz/x' }],
      },
    ]
    vi.mocked(analysisRepo.findAnalysisWithDetails).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'https://example.cz/x',
      seedHeadline: 'Headline',
      status: 'COMPLETE',
      createdAt: new Date('2025-01-01T00:00:00Z'),
      coverages: [OK_COVERAGE],
      synthesisResult: {
        id: 's1',
        analysisId: 'a1',
        dimensions: DIMENSIONS,
        narrative: cachedSegments,
        headline: null,
      },
    })

    const result = await getAnalysisDetail('a1')

    expect(narrativePassModule.runNarrativePass).not.toHaveBeenCalled()
    expect(result.narrative).toEqual(cachedSegments)
  })

  it('serves the Analysis without a narrative if narrative generation fails', async () => {
    vi.mocked(analysisRepo.findAnalysisWithDetails).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'https://example.cz/x',
      seedHeadline: 'Headline',
      status: 'COMPLETE',
      createdAt: new Date('2025-01-01T00:00:00Z'),
      coverages: [OK_COVERAGE],
      synthesisResult: {
        id: 's1',
        analysisId: 'a1',
        dimensions: DIMENSIONS,
        narrative: null,
        headline: null,
      },
    })
    vi.mocked(narrativePassModule.runNarrativePass).mockRejectedValue(new Error('LLM down'))

    const result = await getAnalysisDetail('a1')

    expect(result.narrative).toBeUndefined()
    expect(result.status).toBe('complete')
  })

  it('deduplicates concurrent narrative generation for the same Analysis', async () => {
    const freshAnalysis = () => ({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'https://example.cz/x',
      seedHeadline: 'Headline',
      status: 'COMPLETE' as const,
      createdAt: new Date('2025-01-01T00:00:00Z'),
      coverages: [OK_COVERAGE],
      synthesisResult: {
        id: 's1',
        analysisId: 'a1',
        dimensions: DIMENSIONS,
        narrative: null,
        headline: null,
      },
    })
    vi.mocked(analysisRepo.findAnalysisWithDetails).mockImplementation(() => Promise.resolve(freshAnalysis()))
    const segments = [
      {
        prose: 'Kombinovaná zpráva.',
        attributions: [{ outlet: 'iDnes', czechQuote: 'Q', articleUrl: 'https://idnes.cz/x' }],
      },
    ]
    vi.mocked(narrativePassModule.runNarrativePass).mockResolvedValue({ segments })

    const [resultA, resultB] = await Promise.all([getAnalysisDetail('a1'), getAnalysisDetail('a1')])

    expect(narrativePassModule.runNarrativePass).toHaveBeenCalledTimes(1)
    expect(resultA.narrative).toEqual(segments)
    expect(resultB.narrative).toEqual(segments)
  })

  it('does not attempt narrative generation when the Analysis is not complete', async () => {
    vi.mocked(analysisRepo.findAnalysisWithDetails).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'https://example.cz/x',
      seedHeadline: 'Headline',
      status: 'PENDING',
      createdAt: new Date('2025-01-01T00:00:00Z'),
      coverages: [OK_COVERAGE],
      synthesisResult: null,
    })

    await getAnalysisDetail('a1')

    expect(narrativePassModule.runNarrativePass).not.toHaveBeenCalled()
  })

  it('prefers the generated headline as title when present, falling back to the working title otherwise', async () => {
    vi.mocked(analysisRepo.findAnalysisWithDetails).mockResolvedValueOnce({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'https://example.cz/x',
      seedHeadline: 'Working title',
      status: 'COMPLETE',
      createdAt: new Date('2025-01-01T00:00:00Z'),
      coverages: [],
      synthesisResult: {
        id: 's1',
        analysisId: 'a1',
        dimensions: DIMENSIONS,
        narrative: null,
        headline: 'Generated headline',
      },
    })
    expect((await getAnalysisDetail('a1')).title).toBe('Generated headline')

    vi.mocked(analysisRepo.findAnalysisWithDetails).mockResolvedValueOnce({
      id: 'a2',
      storyId: 's2',
      seedUrl: 'https://example.cz/y',
      seedHeadline: 'Working title',
      status: 'PENDING',
      createdAt: new Date('2025-01-01T00:00:00Z'),
      coverages: [],
      synthesisResult: null,
    })
    expect((await getAnalysisDetail('a2')).title).toBe('Working title')
  })
})

describe('listAnalyses', () => {
  beforeEach(() => vi.resetAllMocks())

  it('maps each repository row to an AnalysisListItem, preferring the generated headline as title when present and falling back to the working title otherwise', async () => {
    vi.mocked(analysisRepo.findAllAnalyses).mockResolvedValue([
      {
        id: 'a1',
        seedHeadline: 'Newer analysis',
        headline: 'Generated headline',
        createdAt: new Date('2025-01-02T00:00:00Z'),
        status: 'COMPLETE',
        okCoverageCount: 3,
      },
      {
        id: 'a2',
        seedHeadline: 'Older analysis',
        headline: null,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        status: 'PENDING',
        okCoverageCount: 0,
      },
    ])

    const result = await listAnalyses(true)

    expect(analysisRepo.findAllAnalyses).toHaveBeenCalledWith(true)
    expect(result).toEqual([
      {
        id: 'a1',
        seedHeadline: 'Newer analysis',
        title: 'Generated headline',
        createdAt: '2025-01-02T00:00:00.000Z',
        coverageCount: 3,
        status: 'complete',
      },
      {
        id: 'a2',
        seedHeadline: 'Older analysis',
        title: 'Older analysis',
        createdAt: '2025-01-01T00:00:00.000Z',
        coverageCount: 0,
        status: 'pending',
      },
    ])
  })

  it('passes includeAllStatuses through to the repository', async () => {
    vi.mocked(analysisRepo.findAllAnalyses).mockResolvedValue([])

    await listAnalyses(false)

    expect(analysisRepo.findAllAnalyses).toHaveBeenCalledWith(false)
  })

  it('returns an empty array when there are no analyses', async () => {
    vi.mocked(analysisRepo.findAllAnalyses).mockResolvedValue([])

    expect(await listAnalyses(true)).toEqual([])
  })
})
