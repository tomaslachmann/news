import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as analysisRepo from '../repositories/analysis.js'
import * as analysisViewRepo from '../repositories/analysisView.js'
import * as coverageRepo from '../repositories/coverage.js'
import * as articleScraperModule from './articleScraper.js'
import * as keywordExtractorModule from './keywordExtractor.js'
import * as discoveryModule from './discovery.js'
import * as sourceResolverModule from './sourceResolver.js'
import * as storyVerificationModule from './storyVerification.js'
import * as embeddingClientModule from './embeddingClient.js'
import * as ingestionServiceModule from './ingestionService.js'
import * as storyRelationRepo from '../repositories/storyRelation.js'
import * as threadRepo from '../repositories/thread.js'
import * as entityRepo from '../repositories/entity.js'
import * as matchDecisionRepo from '../repositories/matchDecision.js'
import * as adminActionLogRepo from '../repositories/adminActionLog.js'
import * as jobsEnqueue from '../jobs/enqueue.js'
import { JobName } from '../jobs/jobDefinitions.js'
import {
  createAnalysis,
  attachSeedToMatch,
  discoverSources,
  confirmCoverages,
  getAnalysisDetail,
  recordAnalysisView,
  listAnalyses,
} from './analysisService.js'
import { ExternalServiceError, NotFoundError, ValidationError } from '../errors.js'

vi.mock('../repositories/analysis.js')
vi.mock('../repositories/analysisView.js')
vi.mock('../repositories/coverage.js')
vi.mock('./articleScraper.js')
vi.mock('./keywordExtractor.js')
vi.mock('./discovery.js')
vi.mock('./sourceResolver.js')
vi.mock('./storyVerification.js')
vi.mock('./embeddingClient.js')
vi.mock('./ingestionService.js')
vi.mock('../repositories/storyRelation.js')
vi.mock('../repositories/thread.js')
vi.mock('../repositories/entity.js')
vi.mock('../jobs/enqueue.js')
vi.mock('../repositories/matchDecision.js')
vi.mock('../repositories/adminActionLog.js')

const ACTOR_ID = 'admin1'

const SCRAPED = { title: 'Headline', excerpt: 'excerpt', fullText: 'full text' }
const SEED_EMBEDDING = [1, 0, 0]
const SEED_EMBEDDING_RESULT = {
  vector: SEED_EMBEDDING,
  model: 'text-embedding-3-small',
  inputHash: 'hash-seed',
}
const SOURCE = { id: 'src-example', name: 'example.cz', domains: ['example.cz'], createdAt: new Date() }

function stubScrapeAndEmbedding() {
  vi.mocked(articleScraperModule.scrapeArticle).mockResolvedValue(SCRAPED)
  vi.mocked(embeddingClientModule.generateEmbedding).mockResolvedValue(SEED_EMBEDDING_RESULT)
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

    const result = await createAnalysis('https://example.cz/x', ACTOR_ID)

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
      embeddingModel: SEED_EMBEDDING_RESULT.model,
      embeddingInputHash: SEED_EMBEDDING_RESULT.inputHash,
    })
    // No eventTime passed at all (ticket 16, amending ADR 0029): scrapeArticle extracts no
    // structured publish date, and this is left for the repository's nullable column default
    // rather than fabricated as submission time.
    expect(vi.mocked(analysisRepo.createAnalysis).mock.calls[0][0].eventTime).toBeUndefined()
    expect(matchDecisionRepo.recordMatchDecisionSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        callSite: 'submissionDedup',
        candidateStoryId: null,
        thresholdMatched: false,
        llmVerdict: null,
        decidedBy: 'THRESHOLD',
      })
    )
    expect(adminActionLogRepo.recordAdminActionSafe).toHaveBeenCalledWith({
      actorId: ACTOR_ID,
      action: 'analysis.created',
      targetType: 'analysis',
      targetId: 'a1',
    })
  })

  it('throws ExternalServiceError when scraping fails', async () => {
    vi.mocked(articleScraperModule.scrapeArticle).mockRejectedValue(new Error('network down'))

    await expect(createAnalysis('https://example.cz/x', ACTOR_ID)).rejects.toThrow(ExternalServiceError)
  })

  it('throws ExternalServiceError when keyword extraction fails', async () => {
    stubScrapeAndEmbedding()
    vi.mocked(keywordExtractorModule.extractKeywords).mockRejectedValue(new Error('LLM down'))

    await expect(createAnalysis('https://example.cz/x', ACTOR_ID)).rejects.toThrow(ExternalServiceError)
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

    const result = await createAnalysis('https://example.cz/x', ACTOR_ID)

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

    const result = await createAnalysis('https://example.cz/x', ACTOR_ID)

    expect(result).toEqual({
      outcome: 'matched',
      id: 'existing-1',
      title: 'Existing headline',
      matchedStatus: 'pending',
    })
    expect(analysisRepo.createAnalysis).not.toHaveBeenCalled()
    expect(keywordExtractorModule.extractKeywords).not.toHaveBeenCalled()
    expect(matchDecisionRepo.recordMatchDecisionSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        callSite: 'submissionDedup',
        candidateStoryId: 's1',
        thresholdMatched: true,
        llmVerdict: true,
        decidedBy: 'LLM',
      })
    )
    // A 'matched' outcome creates nothing for the admin to have decided on — see ticket 09's
    // Answer for why this deliberately isn't logged, unlike the 'created' path above.
    expect(adminActionLogRepo.recordAdminActionSafe).not.toHaveBeenCalled()
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

    const result = await createAnalysis('https://example.cz/x', ACTOR_ID)

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

    const result = await createAnalysis('https://example.cz/x', ACTOR_ID)

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

    const result = await createAnalysis('https://example.cz/x', ACTOR_ID)

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

    const result = await createAnalysis('https://example.cz/x', ACTOR_ID, { force: true })

    expect(result.outcome).toBe('created')
    expect(analysisRepo.findRecentStoriesForMatching).not.toHaveBeenCalled()
    expect(storyVerificationModule.verifySameStoryLogged).not.toHaveBeenCalled()
  })
})

describe('attachSeedToMatch', () => {
  beforeEach(() => vi.resetAllMocks())

  it('throws NotFoundError when the Analysis does not exist', async () => {
    vi.mocked(analysisRepo.findAnalysisById).mockResolvedValue(null)

    await expect(attachSeedToMatch('missing', 'https://example.cz/x', ACTOR_ID)).rejects.toThrow(
      NotFoundError
    )
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

    await expect(attachSeedToMatch('a1', 'https://example.cz/x', ACTOR_ID)).rejects.toThrow(ValidationError)
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
    vi.mocked(sourceResolverModule.resolveSourceByUrl).mockResolvedValue(SOURCE)
    vi.mocked(coverageRepo.findCoveragesForAnalysis).mockResolvedValue([])
    vi.mocked(coverageRepo.addCoveragesIfWithinLimit).mockResolvedValue({ ok: true })

    await attachSeedToMatch('a1', 'https://example.cz/x', ACTOR_ID)

    expect(coverageRepo.addCoveragesIfWithinLimit).toHaveBeenCalledWith(
      'a1',
      [
        {
          analysisId: 'a1',
          sourceId: SOURCE.id,
          title: 'Headline',
          articleUrl: 'https://example.cz/x',
          status: 'PENDING',
        },
      ],
      25
    )
    expect(ingestionServiceModule.approveDraft).not.toHaveBeenCalled()
    expect(adminActionLogRepo.recordAdminActionSafe).toHaveBeenCalledWith({
      actorId: ACTOR_ID,
      action: 'analysis.seed_attached',
      targetType: 'analysis',
      targetId: 'a1',
    })
  })

  it('does not fail the attach when the Analysis is already at MAX_COVERAGES_PER_ANALYSIS, but still approves a DRAFT', async () => {
    vi.mocked(analysisRepo.findAnalysisById).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'x',
      seedHeadline: 'x',
      status: 'DRAFT',
      createdAt: new Date(),
    })
    vi.mocked(articleScraperModule.scrapeArticle).mockResolvedValue(SCRAPED)
    vi.mocked(sourceResolverModule.resolveSourceByUrl).mockResolvedValue(SOURCE)
    vi.mocked(coverageRepo.findCoveragesForAnalysis).mockResolvedValue([])
    vi.mocked(coverageRepo.addCoveragesIfWithinLimit).mockResolvedValue({ ok: false, activeCount: 25 })

    await attachSeedToMatch('a1', 'https://example.cz/x', ACTOR_ID)

    expect(ingestionServiceModule.approveDraft).toHaveBeenCalledWith('a1', ACTOR_ID, undefined)
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
    vi.mocked(sourceResolverModule.resolveSourceByUrl).mockResolvedValue(SOURCE)
    vi.mocked(coverageRepo.findCoveragesForAnalysis).mockResolvedValue([])
    vi.mocked(coverageRepo.addCoveragesIfWithinLimit).mockResolvedValue({ ok: true })

    await attachSeedToMatch('a1', 'https://example.cz/x', ACTOR_ID)

    expect(coverageRepo.addCoveragesIfWithinLimit).toHaveBeenCalled()
    expect(ingestionServiceModule.approveDraft).toHaveBeenCalledWith('a1', ACTOR_ID, undefined)
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
    vi.mocked(sourceResolverModule.resolveSourceByUrl).mockResolvedValue(SOURCE)
    vi.mocked(coverageRepo.findCoveragesForAnalysis).mockResolvedValue([
      {
        id: 'c1',
        analysisId: 'a1',
        sourceId: SOURCE.id,
        source: { name: SOURCE.name },
        title: null,
        articleUrl: 'https://example.cz/already-there',
        publishedAt: null,
        extractedText: null,
        extractionResult: null,
        status: 'PENDING',
        excluded: false,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ])

    await attachSeedToMatch('a1', 'https://example.cz/x', ACTOR_ID)

    expect(coverageRepo.createCoverages).not.toHaveBeenCalled()
    expect(ingestionServiceModule.approveDraft).toHaveBeenCalledWith('a1', ACTOR_ID, undefined)
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

    await expect(attachSeedToMatch('a1', 'https://example.cz/x', ACTOR_ID)).rejects.toThrow(ValidationError)
    expect(coverageRepo.createCoverages).not.toHaveBeenCalled()
    expect(ingestionServiceModule.approveDraft).not.toHaveBeenCalled()
  })
})

describe('discoverSources', () => {
  beforeEach(() => vi.resetAllMocks())

  it('throws NotFoundError when the Analysis does not exist', async () => {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue(null)

    await expect(discoverSources('missing', ['keyword'], ACTOR_ID)).rejects.toThrow(NotFoundError)
  })

  it('discovers candidates, verifies each against the Story, and persists the verified ones as Coverage', async () => {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'x',
      seedHeadline: 'x',
      status: 'PENDING',
      createdAt: new Date(),
      story: {
        id: 's1',
        createdAt: new Date(),
        eventTime: new Date(),
        anchorHeadline: 'x',
        embedding: [],
        embeddingModel: null,
        embeddingInputHash: null,
      },
    })
    vi.mocked(discoveryModule.discoverCoverage).mockResolvedValue({
      candidates: [
        {
          sourceId: 'src-idnes',
          outlet: 'iDnes',
          title: 'T',
          url: 'https://idnes.cz/x',
          publishedAt: '2025-01-01T00:00:00Z',
        },
      ],
      gdeltCount: 1,
    })
    vi.mocked(storyVerificationModule.verifyCandidatesAgainstAnchor).mockImplementation((candidates) =>
      Promise.resolve(candidates)
    )
    vi.mocked(coverageRepo.addCoveragesUpToLimit).mockResolvedValue({
      inserted: [
        {
          analysisId: 'a1',
          sourceId: 'src-idnes',
          title: 'T',
          articleUrl: 'https://idnes.cz/x',
          publishedAt: '2025-01-01T00:00:00Z',
          status: 'PENDING',
        },
      ],
      droppedCount: 0,
    })

    const result = await discoverSources('a1', ['keyword'], ACTOR_ID)

    expect(storyVerificationModule.verifyCandidatesAgainstAnchor).toHaveBeenCalledWith(
      [
        {
          sourceId: 'src-idnes',
          outlet: 'iDnes',
          title: 'T',
          url: 'https://idnes.cz/x',
          publishedAt: '2025-01-01T00:00:00Z',
        },
      ],
      'x',
      undefined
    )
    expect(result).toHaveLength(1)
    expect(coverageRepo.addCoveragesUpToLimit).toHaveBeenCalledWith(
      'a1',
      [
        {
          analysisId: 'a1',
          sourceId: 'src-idnes',
          title: 'T',
          articleUrl: 'https://idnes.cz/x',
          publishedAt: '2025-01-01T00:00:00Z',
          status: 'PENDING',
        },
      ],
      25
    )
    expect(adminActionLogRepo.recordAdminActionSafe).toHaveBeenCalledWith({
      actorId: ACTOR_ID,
      action: 'analysis.discovery_run',
      targetType: 'analysis',
      targetId: 'a1',
    })
  })

  it('excludes a candidate that fails same-story verification', async () => {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'x',
      seedHeadline: 'x',
      status: 'PENDING',
      createdAt: new Date(),
      story: {
        id: 's1',
        createdAt: new Date(),
        eventTime: new Date(),
        anchorHeadline: 'x',
        embedding: [],
        embeddingModel: null,
        embeddingInputHash: null,
      },
    })
    vi.mocked(discoveryModule.discoverCoverage).mockResolvedValue({
      candidates: [
        {
          sourceId: 'src-idnes',
          outlet: 'iDnes',
          title: 'Unrelated',
          url: 'https://idnes.cz/x',
          publishedAt: '2025-01-01T00:00:00Z',
        },
      ],
      gdeltCount: 1,
    })
    vi.mocked(storyVerificationModule.verifyCandidatesAgainstAnchor).mockResolvedValue([])
    vi.mocked(coverageRepo.addCoveragesUpToLimit).mockResolvedValue({ inserted: [], droppedCount: 0 })

    const result = await discoverSources('a1', ['keyword'], ACTOR_ID)

    expect(result).toEqual([])
    expect(coverageRepo.addCoveragesUpToLimit).toHaveBeenCalledWith('a1', [], 25)
  })
})

describe('confirmCoverages', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(jobsEnqueue.enqueueJob).mockResolvedValue('job-1')
  })

  const ANALYSIS = {
    id: 'a1',
    storyId: 's1',
    seedUrl: 'x',
    seedHeadline: 'x',
    status: 'PENDING' as const,
    createdAt: new Date(),
    story: {
      id: 's1',
      createdAt: new Date(),
      eventTime: new Date(),
      anchorHeadline: 'Anchor headline',
      embedding: [1, 0, 0],
      embeddingModel: null,
      embeddingInputHash: null,
    },
  }

  const PENDING_COVERAGE = {
    id: 'c1',
    analysisId: 'a1',
    sourceId: 'src-idnes',
    source: { name: 'iDnes' },
    title: null,
    articleUrl: 'https://idnes.cz/x',
    publishedAt: null,
    extractedText: null,
    extractionResult: null,
    status: 'PENDING' as const,
    excluded: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  }

  function stubHappyPath() {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue(ANALYSIS)
    vi.mocked(coverageRepo.findCoverageUrlsForAnalysis).mockResolvedValue([])
    vi.mocked(coverageRepo.reconcileCoverages).mockResolvedValue({ ok: true })
    vi.mocked(coverageRepo.findCoveragesForAnalysis)
      .mockResolvedValueOnce([PENDING_COVERAGE])
      .mockResolvedValueOnce([PENDING_COVERAGE])
  }

  it('rejects new custom URLs that would push the Analysis past MAX_COVERAGES_PER_ANALYSIS, without creating any of them', async () => {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue(ANALYSIS)
    vi.mocked(coverageRepo.findCoverageUrlsForAnalysis).mockResolvedValue([])
    vi.mocked(sourceResolverModule.resolveSourceByUrl).mockResolvedValue(SOURCE)
    // 20 already active — 5 new custom URLs would total 25, one more pushes it to 26
    vi.mocked(coverageRepo.reconcileCoverages).mockResolvedValue({ ok: false, activeCount: 20 })
    const customUrls = Array.from({ length: 6 }, (_, i) => `https://example.cz/extra-${i}`)

    await expect(confirmCoverages('a1', { confirmedIds: [], customUrls }, ACTOR_ID)).rejects.toThrow(
      ValidationError
    )
    expect(coverageRepo.createCoverages).not.toHaveBeenCalled()
  })

  it('allows new custom URLs that land exactly at MAX_COVERAGES_PER_ANALYSIS', async () => {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue(ANALYSIS)
    vi.mocked(coverageRepo.findCoverageUrlsForAnalysis).mockResolvedValue([])
    vi.mocked(sourceResolverModule.resolveSourceByUrl).mockResolvedValue(SOURCE)
    vi.mocked(coverageRepo.reconcileCoverages).mockResolvedValue({ ok: true })
    vi.mocked(coverageRepo.findCoveragesForAnalysis).mockResolvedValueOnce([]).mockResolvedValueOnce([])
    const customUrls = Array.from({ length: 5 }, (_, i) => `https://example.cz/extra-${i}`)

    await confirmCoverages('a1', { confirmedIds: [], customUrls }, ACTOR_ID)

    expect(coverageRepo.reconcileCoverages).toHaveBeenCalledWith(
      'a1',
      [],
      expect.arrayContaining([expect.objectContaining({ analysisId: 'a1' })]),
      25
    )
  })

  it('never scrapes more than 4 PENDING Coverage rows concurrently (ADR 0032)', async () => {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue(ANALYSIS)
    vi.mocked(coverageRepo.findCoverageUrlsForAnalysis).mockResolvedValue([])
    vi.mocked(coverageRepo.reconcileCoverages).mockResolvedValue({ ok: true })
    const manyPending = Array.from({ length: 10 }, (_, i) => ({
      ...PENDING_COVERAGE,
      id: `c${i}`,
      articleUrl: `https://idnes.cz/x${i}`,
    }))
    vi.mocked(coverageRepo.findCoveragesForAnalysis)
      .mockResolvedValueOnce(manyPending)
      .mockResolvedValueOnce(manyPending)

    let active = 0
    let maxActive = 0
    vi.mocked(articleScraperModule.scrapeForCoverage).mockImplementation(async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 1))
      active--
      return { status: 'OK', extractedText: SCRAPED.fullText }
    })

    await confirmCoverages('a1', { confirmedIds: manyPending.map((c) => c.id) }, ACTOR_ID)

    expect(maxActive).toBeLessThanOrEqual(4)
    expect(articleScraperModule.scrapeForCoverage).toHaveBeenCalledTimes(10)
  })

  it('marks a Coverage extraction-failed when the scraped text matches a blocked-content phrase, even though it is long', async () => {
    stubHappyPath()
    vi.mocked(articleScraperModule.scrapeForCoverage).mockResolvedValue({ status: 'EXTRACTION_FAILED' })

    await confirmCoverages('a1', { confirmedIds: ['c1'] }, ACTOR_ID)

    expect(coverageRepo.updateCoverage).toHaveBeenCalledWith('c1', { status: 'EXTRACTION_FAILED' })
  })

  it('marks a Coverage ok when the scraped text is ordinary article content', async () => {
    stubHappyPath()
    const fullText = 'A perfectly ordinary article body with plenty of real content in it. '.repeat(10)
    vi.mocked(articleScraperModule.scrapeForCoverage).mockResolvedValue({
      status: 'OK',
      extractedText: fullText,
    })

    await confirmCoverages('a1', { confirmedIds: ['c1'] }, ACTOR_ID)

    expect(coverageRepo.updateCoverage).toHaveBeenCalledWith('c1', { extractedText: fullText, status: 'OK' })
  })

  it('enqueues the entity.extract job with this Analysis id and the coverage-confirmation origin', async () => {
    stubHappyPath()
    const fullText = 'A perfectly ordinary article body with plenty of real content in it. '.repeat(10)
    vi.mocked(articleScraperModule.scrapeForCoverage).mockResolvedValue({
      status: 'OK',
      extractedText: fullText,
    })
    vi.mocked(coverageRepo.findCoveragesForAnalysis)
      .mockReset()
      .mockResolvedValueOnce([PENDING_COVERAGE])
      .mockResolvedValueOnce([{ ...PENDING_COVERAGE, status: 'OK', extractedText: fullText }])

    await confirmCoverages('a1', { confirmedIds: ['c1'] }, ACTOR_ID)

    expect(jobsEnqueue.enqueueJob).toHaveBeenCalledWith(JobName.EntityRelation, {
      analysisId: 'a1',
      origin: 'coverage-confirmation',
      coverageIds: ['c1'],
    })
    expect(adminActionLogRepo.recordAdminActionSafe).toHaveBeenCalledWith({
      actorId: ACTOR_ID,
      action: 'analysis.coverages_confirmed',
      targetType: 'analysis',
      targetId: 'a1',
    })
  })

  it('excludes an EXTRACTION_FAILED Coverage id from coverageIds even though it is still non-excluded', async () => {
    stubHappyPath()
    vi.mocked(articleScraperModule.scrapeForCoverage).mockResolvedValue({ status: 'EXTRACTION_FAILED' })
    vi.mocked(coverageRepo.findCoveragesForAnalysis)
      .mockReset()
      .mockResolvedValueOnce([PENDING_COVERAGE])
      .mockResolvedValueOnce([{ ...PENDING_COVERAGE, status: 'EXTRACTION_FAILED', extractedText: null }])

    await confirmCoverages('a1', { confirmedIds: ['c1'] }, ACTOR_ID)

    expect(jobsEnqueue.enqueueJob).toHaveBeenCalledWith(JobName.EntityRelation, {
      analysisId: 'a1',
      origin: 'coverage-confirmation',
      coverageIds: [],
    })
  })
})

describe('getAnalysisDetail', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(storyRelationRepo.findPublishedRelationsForStory).mockResolvedValue([])
    vi.mocked(threadRepo.findThreadForStory).mockResolvedValue(null)
    vi.mocked(entityRepo.findEntityMentionsForStory).mockResolvedValue([])
    vi.mocked(entityRepo.findEntityRelationsForStory).mockResolvedValue([])
  })

  const OK_COVERAGE = {
    id: 'c1',
    analysisId: 'a1',
    sourceId: 'src-idnes',
    source: { name: 'iDnes' },
    title: null,
    articleUrl: 'https://idnes.cz/x',
    publishedAt: null,
    extractedText: 'Plný text článku.',
    extractionResult: null,
    status: 'OK' as const,
    excluded: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  }

  const DIMENSIONS = { agreement: [], contradiction: [], uniqueReporting: [], framing: [] }

  it('throws NotFoundError when the Analysis does not exist', async () => {
    vi.mocked(analysisRepo.findAnalysisWithDetails).mockResolvedValue(null)

    await expect(getAnalysisDetail('missing', true)).rejects.toThrow(NotFoundError)
  })

  it.each(['DRAFT', 'PENDING', 'FAILED'] as const)(
    'throws NotFoundError for a non-Admin caller when the Analysis is %s, never leaking its in-progress internals (ticket 52)',
    async (status) => {
      vi.mocked(analysisRepo.findAnalysisWithDetails).mockResolvedValue({
        id: 'a1',
        storyId: 's1',
        seedUrl: 'https://example.cz/x',
        seedHeadline: 'Headline',
        status,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        coverages: [],
        synthesisResult: null,
      })

      await expect(getAnalysisDetail('a1', false)).rejects.toThrow(NotFoundError)
    }
  )

  it('returns the Analysis for a non-Admin caller once it is COMPLETE (ticket 52)', async () => {
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

    const result = await getAnalysisDetail('a1', false)

    expect(result.status).toBe('complete')
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

    const result = await getAnalysisDetail('a1', true)

    expect(result.status).toBe('complete')
    expect(result.coverages).toEqual([])
    expect(result.synthesisResult).toBeUndefined()
  })

  const VALID_EXTRACTION_RESULT = {
    factualClaims: [{ claim: 'x', czechQuote: 'x' }],
    attributedClaims: [],
    interpretiveStatements: [],
    framingSignals: [],
  }

  it('interprets a non-null sourceOverlapPercentage into a tier, once, for the frontend (ticket 38 / ADR 0030)', async () => {
    vi.mocked(analysisRepo.findAnalysisWithDetails).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'https://example.cz/x',
      seedHeadline: 'Headline',
      status: 'COMPLETE',
      createdAt: new Date('2025-01-01T00:00:00Z'),
      coverages: [{ ...OK_COVERAGE, extractionResult: VALID_EXTRACTION_RESULT }],
      synthesisResult: {
        id: 's1',
        analysisId: 'a1',
        dimensions: DIMENSIONS,
        sourceOverlapPercentage: 70,
        agreementCategory: 'PARTIAL',
        narrative: null,
        headline: 'Headline',
        narrativeGenerationFailedAt: null,
        narrativeImage: null,
      },
    })

    const result = await getAnalysisDetail('a1', true)

    expect(result.sourceOverlap).toEqual({ percentage: 70, sourceCount: 1, tier: 'mid' })
  })

  it("counts sourceCount from successfully-extracted Coverage only, not every attached Coverage (ticket 39's byline gauge threshold reads this, not coverages.length)", async () => {
    vi.mocked(analysisRepo.findAnalysisWithDetails).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'https://example.cz/x',
      seedHeadline: 'Headline',
      status: 'COMPLETE',
      createdAt: new Date('2025-01-01T00:00:00Z'),
      coverages: [
        { ...OK_COVERAGE, id: 'c1', extractionResult: VALID_EXTRACTION_RESULT },
        { ...OK_COVERAGE, id: 'c2', extractionResult: null }, // scraped OK, extraction never ran
        { ...OK_COVERAGE, id: 'c3', extractionResult: { malformed: true }, status: 'OK' as const }, // failed schema validation
        {
          ...OK_COVERAGE,
          id: 'c4',
          extractionResult: VALID_EXTRACTION_RESULT,
          status: 'EXTRACTION_FAILED' as const,
        },
      ],
      synthesisResult: {
        id: 's1',
        analysisId: 'a1',
        dimensions: DIMENSIONS,
        sourceOverlapPercentage: 100,
        agreementCategory: 'PARTIAL',
        narrative: null,
        headline: 'Headline',
        narrativeGenerationFailedAt: null,
        narrativeImage: null,
      },
    })

    const result = await getAnalysisDetail('a1', true)

    expect(result.coverages).toHaveLength(4)
    expect(result.sourceOverlap?.sourceCount).toBe(1)
  })

  it('omits sourceOverlap — not zero — when there is nothing to measure', async () => {
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
        sourceOverlapPercentage: null,
        agreementCategory: 'PARTIAL',
        narrative: null,
        headline: 'Headline',
        narrativeGenerationFailedAt: null,
        narrativeImage: null,
      },
    })

    const result = await getAnalysisDetail('a1', true)

    expect(result.sourceOverlap).toBeUndefined()
  })

  it('fetches published relations for this Story and includes them as relatedEvents', async () => {
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
    vi.mocked(storyRelationRepo.findPublishedRelationsForStory).mockResolvedValue([
      {
        fromStoryId: 's1',
        toStoryId: 's-other',
        type: 'FOLLOW_UP',
        fromAnalysisId: 'a1',
        fromSeedHeadline: 'Headline',
        fromHeadline: null,
        fromStatus: 'COMPLETE',
        fromCoverageCount: 2,
        toAnalysisId: 'a-other',
        toSeedHeadline: 'Other working title',
        toHeadline: 'Other generated headline',
        toStatus: 'COMPLETE',
        toCoverageCount: 4,
      },
    ])

    const result = await getAnalysisDetail('a1', true)

    expect(storyRelationRepo.findPublishedRelationsForStory).toHaveBeenCalledWith('s1')
    expect(result.relatedEvents).toEqual([
      { analysisId: 'a-other', title: 'Other generated headline', type: 'FOLLOW_UP', coverageCount: 4 },
    ])
  })

  it('includes the Thread summary when this Story belongs to one with at least 2 linkable members', async () => {
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
    vi.mocked(threadRepo.findThreadForStory).mockResolvedValue({
      title: 'Vícedílná kauza',
      slug: 'vicedilna-kauza',
      memberCount: 2,
      members: [
        { analysisId: 'a1', seedHeadline: 'Headline', headline: null, status: 'COMPLETE', position: 0 },
        {
          analysisId: 'a2',
          seedHeadline: 'Other',
          headline: 'Other headline',
          status: 'COMPLETE',
          position: 1,
        },
      ],
    })

    const result = await getAnalysisDetail('a1', true)

    expect(threadRepo.findThreadForStory).toHaveBeenCalledWith('s1')
    expect(result.thread).toEqual({
      title: 'Vícedílná kauza',
      slug: 'vicedilna-kauza',
      memberCount: 2,
      members: [
        { analysisId: 'a1', title: 'Headline', isCurrent: true },
        { analysisId: 'a2', title: 'Other headline', isCurrent: false },
      ],
    })
  })

  it('omits the Thread summary when fewer than 2 members are currently linkable (COMPLETE)', async () => {
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
    vi.mocked(threadRepo.findThreadForStory).mockResolvedValue({
      title: 'Vícedílná kauza',
      slug: 'vicedilna-kauza',
      memberCount: 2,
      members: [
        { analysisId: 'a1', seedHeadline: 'Headline', headline: null, status: 'COMPLETE', position: 0 },
        { analysisId: 'a2', seedHeadline: 'Other', headline: null, status: 'PENDING', position: 1 },
      ],
    })

    const result = await getAnalysisDetail('a1', true)

    expect(result.thread).toBeUndefined()
  })

  it('does not fetch the Thread when the Analysis is not COMPLETE', async () => {
    vi.mocked(analysisRepo.findAnalysisWithDetails).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'https://example.cz/x',
      seedHeadline: 'Headline',
      status: 'PENDING',
      createdAt: new Date('2025-01-01T00:00:00Z'),
      coverages: [],
      synthesisResult: null,
    })

    const result = await getAnalysisDetail('a1', true)

    expect(threadRepo.findThreadForStory).not.toHaveBeenCalled()
    expect(result.thread).toBeUndefined()
  })

  it("returns the cached narrative verbatim — generation is the narrative.generate job's job (ticket 15), not this read path", async () => {
    const cachedDocument = {
      version: 1,
      blocks: [{ type: 'paragraph', children: [{ type: 'text', text: 'Uloženo v mezipaměti.' }] }],
      assertions: [],
      entityRefs: [],
      sourceRefs: [],
      valueRefs: [],
    }
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
        sourceOverlapPercentage: null,
        agreementCategory: 'PARTIAL',
        narrative: cachedDocument,
        headline: null,
        narrativeGenerationFailedAt: null,
        narrativeImage: null,
      },
    })

    const result = await getAnalysisDetail('a1', true)

    expect(result.narrative).toEqual(cachedDocument)
  })

  it('maps a persisted lead image (ticket 51), preferring its thumbnail over the full-resolution original', async () => {
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
        sourceOverlapPercentage: null,
        agreementCategory: 'PARTIAL',
        narrative: null,
        headline: 'Headline',
        narrativeGenerationFailedAt: null,
        narrativeImage: {
          id: 'img-1',
          synthesisResultId: 's1',
          provider: 'WIKIMEDIA',
          externalId: 'Prague Castle.jpg',
          imageUrl: 'https://upload.wikimedia.org/full/Prague_Castle.jpg',
          thumbnailUrl: 'https://upload.wikimedia.org/thumb/Prague_Castle.jpg',
          author: 'Jane Doe',
          license: 'CC BY-SA 4.0',
          sourceUrl: 'https://commons.wikimedia.org/wiki/File:Prague_Castle.jpg',
          width: 6000,
          height: 4000,
          createdAt: new Date('2025-01-01T00:00:00Z'),
        },
      },
    })

    const result = await getAnalysisDetail('a1', true)

    expect(result.leadImage).toEqual({
      imageUrl: 'https://upload.wikimedia.org/thumb/Prague_Castle.jpg',
      author: 'Jane Doe',
      license: 'CC BY-SA 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Prague_Castle.jpg',
    })
  })

  it('returns no lead image when none was found or fetched', async () => {
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
        sourceOverlapPercentage: null,
        agreementCategory: 'PARTIAL',
        narrative: null,
        headline: 'Headline',
        narrativeGenerationFailedAt: null,
        narrativeImage: null,
      },
    })

    const result = await getAnalysisDetail('a1', true)

    expect(result.leadImage).toBeUndefined()
  })

  it('returns no narrative, without attempting generation, when none has been cached yet (pending or failed job alike)', async () => {
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
        sourceOverlapPercentage: null,
        agreementCategory: 'PARTIAL',
        narrative: null,
        headline: null,
        narrativeGenerationFailedAt: new Date('2025-01-01T00:00:00Z'),
        narrativeImage: null,
      },
    })

    const result = await getAnalysisDetail('a1', true)

    expect(result.narrative).toBeUndefined()
  })

  it('does not fetch related events when the Analysis is not COMPLETE, since AnalysisPage never shows them for a non-COMPLETE Analysis', async () => {
    vi.mocked(analysisRepo.findAnalysisWithDetails).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'https://example.cz/x',
      seedHeadline: 'Headline',
      status: 'PENDING',
      createdAt: new Date('2025-01-01T00:00:00Z'),
      coverages: [],
      synthesisResult: null,
    })

    const result = await getAnalysisDetail('a1', true)

    expect(storyRelationRepo.findPublishedRelationsForStory).not.toHaveBeenCalled()
    expect(result.relatedEvents).toEqual([])
  })

  it("fetches this Story's entity mentions and includes them as entities (ticket 43)", async () => {
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
    vi.mocked(entityRepo.findEntityMentionsForStory).mockResolvedValue([
      { key: 'person:donald-tusk', canonicalName: 'Donald Tusk', type: 'PERSON', imageUrl: null },
    ])

    const result = await getAnalysisDetail('a1', true)

    expect(entityRepo.findEntityMentionsForStory).toHaveBeenCalledWith('s1')
    // toEntityMentionItem (mappers/analysis.ts) drops imageUrl — the "Entity ve zprávě" rail never
    // showed images; only the Narrative pass's own KnownEntity reads this row's imageUrl.
    expect(result.entities).toEqual([
      { key: 'person:donald-tusk', canonicalName: 'Donald Tusk', type: 'PERSON' },
    ])
  })

  it('does not fetch entity mentions when the Analysis is not COMPLETE', async () => {
    vi.mocked(analysisRepo.findAnalysisWithDetails).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'https://example.cz/x',
      seedHeadline: 'Headline',
      status: 'PENDING',
      createdAt: new Date('2025-01-01T00:00:00Z'),
      coverages: [],
      synthesisResult: null,
    })

    const result = await getAnalysisDetail('a1', true)

    expect(entityRepo.findEntityMentionsForStory).not.toHaveBeenCalled()
    expect(result.entities).toEqual([])
  })

  it("fetches this Story's entity relations and includes them as entityRelations (ticket 47 / ADR 0034)", async () => {
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
    vi.mocked(entityRepo.findEntityRelationsForStory).mockResolvedValue([
      {
        id: 'rel1',
        type: 'REPRESENTS',
        fromEntity: { key: 'person:donald-tusk', canonicalName: 'Donald Tusk', type: 'PERSON' },
        toEntity: { key: 'country:poland', canonicalName: 'Poland', type: 'COUNTRY' },
      },
    ])

    const result = await getAnalysisDetail('a1', true)

    expect(entityRepo.findEntityRelationsForStory).toHaveBeenCalledWith('s1')
    expect(result.entityRelations).toEqual([
      {
        id: 'rel1',
        type: 'REPRESENTS',
        fromEntity: { key: 'person:donald-tusk', canonicalName: 'Donald Tusk', type: 'PERSON' },
        toEntity: { key: 'country:poland', canonicalName: 'Poland', type: 'COUNTRY' },
      },
    ])
  })

  it('does not fetch entity relations when the Analysis is not COMPLETE', async () => {
    vi.mocked(analysisRepo.findAnalysisWithDetails).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'https://example.cz/x',
      seedHeadline: 'Headline',
      status: 'PENDING',
      createdAt: new Date('2025-01-01T00:00:00Z'),
      coverages: [],
      synthesisResult: null,
    })

    const result = await getAnalysisDetail('a1', true)

    expect(entityRepo.findEntityRelationsForStory).not.toHaveBeenCalled()
    expect(result.entityRelations).toEqual([])
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
        sourceOverlapPercentage: null,
        agreementCategory: 'PARTIAL',
        narrative: null,
        headline: 'Generated headline',
        narrativeGenerationFailedAt: null,
        narrativeImage: null,
      },
    })
    expect((await getAnalysisDetail('a1', true)).title).toBe('Generated headline')

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
    expect((await getAnalysisDetail('a2', true)).title).toBe('Working title')
  })
})

describe('recordAnalysisView', () => {
  beforeEach(() => vi.resetAllMocks())

  it('records a view for a COMPLETE Analysis', async () => {
    vi.mocked(analysisRepo.findAnalysisById).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'https://example.cz/x',
      seedHeadline: 'Headline',
      status: 'COMPLETE',
      createdAt: new Date('2025-01-01T00:00:00Z'),
    })

    await recordAnalysisView('a1')

    expect(analysisViewRepo.createAnalysisView).toHaveBeenCalledWith('a1')
  })

  it.each(['DRAFT', 'PENDING', 'FAILED'] as const)(
    'does not record a view when the Analysis is %s',
    async (status) => {
      vi.mocked(analysisRepo.findAnalysisById).mockResolvedValue({
        id: 'a1',
        storyId: 's1',
        seedUrl: 'https://example.cz/x',
        seedHeadline: 'Headline',
        status,
        createdAt: new Date('2025-01-01T00:00:00Z'),
      })

      await recordAnalysisView('a1')

      expect(analysisViewRepo.createAnalysisView).not.toHaveBeenCalled()
    }
  )

  it('does not throw and does not record a view when the Analysis does not exist', async () => {
    vi.mocked(analysisRepo.findAnalysisById).mockResolvedValue(null)

    await expect(recordAnalysisView('missing')).resolves.toBeUndefined()

    expect(analysisViewRepo.createAnalysisView).not.toHaveBeenCalled()
  })
})

describe('listAnalyses', () => {
  beforeEach(() => vi.resetAllMocks())

  const ROW_A1 = {
    id: 'a1',
    seedHeadline: 'Newer analysis',
    headline: 'Generated headline',
    createdAt: new Date('2025-01-02T00:00:00Z'),
    status: 'COMPLETE' as const,
    okCoverageCount: 3,
    coverages: [
      {
        status: 'OK' as const,
        extractionResult: {
          factualClaims: [],
          attributedClaims: [],
          interpretiveStatements: [],
          framingSignals: [],
        },
        sourceName: 'ČTK',
      },
      {
        status: 'OK' as const,
        extractionResult: {
          factualClaims: [],
          attributedClaims: [],
          interpretiveStatements: [],
          framingSignals: [],
        },
        sourceName: 'Reuters',
      },
      {
        status: 'OK' as const,
        extractionResult: null,
        sourceName: 'ČTK',
      },
    ],
    dimensions: {
      agreement: [{ id: 'agree-1', prose: 'Shoda na hlavním bodu.', attributions: [] }],
      contradiction: [{ id: 'conflict-1', prose: 'Jeden zdroj uvádí jiný čas.', attributions: [] }],
      uniqueReporting: [],
      framing: [],
      agreementCategory: 'PARTIAL' as const,
    },
    sourceOverlapPercentage: 67,
    leadImage: {
      imageUrl: 'https://images.example/full.jpg',
      thumbnailUrl: 'https://images.example/thumb.jpg',
      author: 'Foto autor',
      license: 'CC BY 4.0',
      sourceUrl: 'https://images.example/source',
    },
    entityNames: ['Ukrajina', 'Evropská komise', 'Ukrajina'],
  }
  const ROW_A2 = {
    id: 'a2',
    seedHeadline: 'Older analysis',
    headline: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    status: 'PENDING' as const,
    okCoverageCount: 0,
    coverages: [],
    dimensions: null,
    sourceOverlapPercentage: null,
    leadImage: null,
    entityNames: [],
  }

  it('maps each repository row to an AnalysisListItem, preferring the generated headline as title when present and falling back to the working title otherwise', async () => {
    vi.mocked(analysisRepo.findAnalysesPage).mockResolvedValue([ROW_A1, ROW_A2])

    const result = await listAnalyses(true, undefined)

    expect(analysisRepo.findAnalysesPage).toHaveBeenCalledWith(true, undefined, 20)
    expect(result.items).toEqual([
      {
        id: 'a1',
        seedHeadline: 'Newer analysis',
        title: 'Generated headline',
        createdAt: '2025-01-02T00:00:00.000Z',
        coverageCount: 3,
        status: 'complete',
        summary: {
          teaser: 'Shoda na hlavním bodu.',
          hasConflict: true,
          sourceOverlap: { percentage: 67, sourceCount: 2, tier: 'mid' },
          outlets: ['ČTK', 'Reuters'],
          entities: ['Ukrajina', 'Evropská komise'],
          leadImage: {
            imageUrl: 'https://images.example/thumb.jpg',
            author: 'Foto autor',
            license: 'CC BY 4.0',
            sourceUrl: 'https://images.example/source',
          },
        },
      },
      {
        id: 'a2',
        seedHeadline: 'Older analysis',
        title: 'Older analysis',
        createdAt: '2025-01-01T00:00:00.000Z',
        coverageCount: 0,
        status: 'pending',
        summary: undefined,
      },
    ])
    expect(result.nextCursor).toBeNull()
  })

  it('passes includeAllStatuses through to the repository', async () => {
    vi.mocked(analysisRepo.findAnalysesPage).mockResolvedValue([])

    await listAnalyses(false, undefined)

    expect(analysisRepo.findAnalysesPage).toHaveBeenCalledWith(false, undefined, 20)
  })

  it('returns an empty page when there are no analyses', async () => {
    vi.mocked(analysisRepo.findAnalysesPage).mockResolvedValue([])

    expect(await listAnalyses(true, undefined)).toEqual({ items: [], nextCursor: null })
  })

  it('returns a nextCursor when the repository returns one more row than the page limit', async () => {
    vi.mocked(analysisRepo.findAnalysesPage).mockResolvedValue([ROW_A1, ROW_A2])

    const result = await listAnalyses(true, undefined, 1)

    expect(analysisRepo.findAnalysesPage).toHaveBeenCalledWith(true, undefined, 1)
    expect(result.items).toHaveLength(1)
    expect(result.nextCursor).not.toBeNull()
  })

  it('decodes an incoming cursor and passes it through to the repository', async () => {
    vi.mocked(analysisRepo.findAnalysesPage).mockResolvedValue([])
    const createdAt = new Date('2025-01-01T00:00:00.000Z')
    const cursor = Buffer.from(`${createdAt.toISOString()}|a1`).toString('base64url')

    await listAnalyses(true, cursor)

    expect(analysisRepo.findAnalysesPage).toHaveBeenCalledWith(true, { createdAt, id: 'a1' }, 20)
  })

  it('caps a caller-requested limit at MAX_PAGE_SIZE rather than trusting it outright', async () => {
    vi.mocked(analysisRepo.findAnalysesPage).mockResolvedValue([])

    await listAnalyses(true, undefined, 999)

    expect(analysisRepo.findAnalysesPage).toHaveBeenCalledWith(true, undefined, 50)
  })
})
