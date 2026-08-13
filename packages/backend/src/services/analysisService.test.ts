import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as analysisRepo from '../repositories/analysis.js'
import * as coverageRepo from '../repositories/coverage.js'
import * as articleScraperModule from './articleScraper.js'
import * as keywordExtractorModule from './keywordExtractor.js'
import * as discoveryModule from './discovery.js'
import { createAnalysis, discoverSources, getAnalysisDetail, listAnalyses } from './analysisService.js'
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
