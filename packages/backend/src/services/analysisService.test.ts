import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as analysisRepo from '../repositories/analysis.js'
import * as coverageRepo from '../repositories/coverage.js'
import * as articleScraperModule from './articleScraper.js'
import * as keywordExtractorModule from './keywordExtractor.js'
import * as discoveryModule from './discovery.js'
import {
  createAnalysis,
  discoverSources,
  confirmCoverages,
  getAnalysisDetail,
  listAnalyses,
} from './analysisService.js'
import { ExternalServiceError, NotFoundError } from '../errors.js'

vi.mock('../repositories/analysis.js')
vi.mock('../repositories/coverage.js')
vi.mock('./articleScraper.js')
vi.mock('./keywordExtractor.js')
vi.mock('./discovery.js')

describe('createAnalysis', () => {
  beforeEach(() => vi.resetAllMocks())

  it('scrapes the seed article, extracts keywords, and creates the Analysis', async () => {
    vi.mocked(articleScraperModule.scrapeArticle).mockResolvedValue({
      title: 'Headline',
      excerpt: 'excerpt',
      fullText: 'full text',
    })
    vi.mocked(keywordExtractorModule.extractKeywords).mockResolvedValue(['keyword1', 'keyword2'])
    vi.mocked(analysisRepo.createAnalysis).mockResolvedValue({
      id: 'a1',
      seedUrl: 'https://example.cz/x',
      seedHeadline: 'Headline',
      status: 'PENDING',
      createdAt: new Date(),
    })

    const result = await createAnalysis('https://example.cz/x')

    expect(result).toEqual({ id: 'a1', seedHeadline: 'Headline', keywords: ['keyword1', 'keyword2'] })
    expect(analysisRepo.createAnalysis).toHaveBeenCalledWith({
      seedUrl: 'https://example.cz/x',
      seedHeadline: 'Headline',
    })
  })

  it('throws ExternalServiceError when scraping fails', async () => {
    vi.mocked(articleScraperModule.scrapeArticle).mockRejectedValue(new Error('network down'))

    await expect(createAnalysis('https://example.cz/x')).rejects.toThrow(ExternalServiceError)
  })

  it('throws ExternalServiceError when keyword extraction fails', async () => {
    vi.mocked(articleScraperModule.scrapeArticle).mockResolvedValue({
      title: 'Headline',
      excerpt: 'excerpt',
      fullText: 'full text',
    })
    vi.mocked(keywordExtractorModule.extractKeywords).mockRejectedValue(new Error('LLM down'))

    await expect(createAnalysis('https://example.cz/x')).rejects.toThrow(ExternalServiceError)
  })
})

describe('discoverSources', () => {
  beforeEach(() => vi.resetAllMocks())

  it('throws NotFoundError when the Analysis does not exist', async () => {
    vi.mocked(analysisRepo.findAnalysisById).mockResolvedValue(null)

    await expect(discoverSources('missing', ['keyword'])).rejects.toThrow(NotFoundError)
  })

  it('discovers candidates and persists them as Coverage rows', async () => {
    vi.mocked(analysisRepo.findAnalysisById).mockResolvedValue({
      id: 'a1',
      seedUrl: 'x',
      seedHeadline: 'x',
      status: 'PENDING',
      createdAt: new Date(),
    })
    vi.mocked(discoveryModule.discoverCoverage).mockResolvedValue([
      { outlet: 'iDnes', title: 'T', url: 'https://idnes.cz/x', publishedAt: '2025-01-01T00:00:00Z' },
    ])

    const result = await discoverSources('a1', ['keyword'])

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
})

describe('confirmCoverages', () => {
  beforeEach(() => vi.resetAllMocks())

  const ANALYSIS = {
    id: 'a1',
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

  it('throws NotFoundError when the Analysis does not exist', async () => {
    vi.mocked(analysisRepo.findAnalysisWithDetails).mockResolvedValue(null)

    await expect(getAnalysisDetail('missing')).rejects.toThrow(NotFoundError)
  })

  it('maps the Analysis, its coverages, and synthesis result to AnalysisDetail', async () => {
    vi.mocked(analysisRepo.findAnalysisWithDetails).mockResolvedValue({
      id: 'a1',
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
})

describe('listAnalyses', () => {
  beforeEach(() => vi.resetAllMocks())

  it('maps each repository row to an AnalysisListItem', async () => {
    vi.mocked(analysisRepo.findAllAnalyses).mockResolvedValue([
      {
        id: 'a1',
        seedHeadline: 'Newer analysis',
        createdAt: new Date('2025-01-02T00:00:00Z'),
        status: 'COMPLETE',
        okCoverageCount: 3,
      },
      {
        id: 'a2',
        seedHeadline: 'Older analysis',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        status: 'PENDING',
        okCoverageCount: 0,
      },
    ])

    const result = await listAnalyses()

    expect(result).toEqual([
      {
        id: 'a1',
        seedHeadline: 'Newer analysis',
        createdAt: '2025-01-02T00:00:00.000Z',
        coverageCount: 3,
        status: 'complete',
      },
      {
        id: 'a2',
        seedHeadline: 'Older analysis',
        createdAt: '2025-01-01T00:00:00.000Z',
        coverageCount: 0,
        status: 'pending',
      },
    ])
  })

  it('returns an empty array when there are no analyses', async () => {
    vi.mocked(analysisRepo.findAllAnalyses).mockResolvedValue([])

    expect(await listAnalyses()).toEqual([])
  })
})
