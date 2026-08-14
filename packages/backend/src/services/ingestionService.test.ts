import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as analysisRepo from '../repositories/analysis.js'
import * as coverageRepo from '../repositories/coverage.js'
import * as pendingAdditionRepo from '../repositories/pendingAddition.js'
import * as rssModule from './rss.js'
import * as discoveryModule from './discovery.js'
import * as articleScraperModule from './articleScraper.js'
import * as keywordExtractorModule from './keywordExtractor.js'
import * as storyVerificationModule from './storyVerification.js'
import { runIngestionPass, approveDraft, rejectDraft, listPendingAdditions } from './ingestionService.js'
import { NotFoundError, ValidationError } from '../errors.js'

vi.mock('../repositories/analysis.js')
vi.mock('../repositories/coverage.js')
vi.mock('../repositories/pendingAddition.js')
vi.mock('./rss.js')
vi.mock('./discovery.js')
vi.mock('./articleScraper.js')
vi.mock('./keywordExtractor.js')
vi.mock('./storyVerification.js')

const RSS_ITEM = {
  outlet: 'iDnes',
  title: 'Fresh headline',
  url: 'https://idnes.cz/fresh-article',
  publishedAt: '2026-01-01T00:00:00Z',
}

const SAME_EVENT = { sameEvent: true, reasoning: 'stub: same event' }
const DIFFERENT_EVENT = { sameEvent: false, reasoning: 'stub: different event' }

function stubCommon() {
  vi.mocked(analysisRepo.findAllSeedUrls).mockResolvedValue([])
  vi.mocked(coverageRepo.findAllArticleUrls).mockResolvedValue([])
  vi.mocked(articleScraperModule.scrapeArticle).mockResolvedValue({
    title: 'Fresh headline',
    excerpt: 'excerpt',
    fullText: 'full text',
  })
  vi.mocked(keywordExtractorModule.extractKeywords).mockResolvedValue(['keyword'])
  vi.mocked(storyVerificationModule.verifySameStoryLogged).mockResolvedValue(SAME_EVENT)
  vi.mocked(storyVerificationModule.verifyCandidatesAgainstAnchor).mockImplementation((candidates) =>
    Promise.resolve(candidates)
  )
}

describe('runIngestionPass', () => {
  beforeEach(() => vi.resetAllMocks())

  it('skips an RSS item whose URL is already a known Seed Article or Coverage', async () => {
    vi.mocked(rssModule.queryRssFeeds).mockResolvedValue([RSS_ITEM])
    vi.mocked(analysisRepo.findAllSeedUrls).mockResolvedValue([RSS_ITEM.url])
    vi.mocked(coverageRepo.findAllArticleUrls).mockResolvedValue([])

    const summary = await runIngestionPass()

    expect(summary).toEqual({ checked: 1, created: 0, attached: 0, flagged: 0, skipped: 1 })
    expect(articleScraperModule.scrapeArticle).not.toHaveBeenCalled()
  })

  it('creates a new Draft Analysis when nothing matches an existing recent Analysis', async () => {
    stubCommon()
    vi.mocked(rssModule.queryRssFeeds).mockResolvedValue([RSS_ITEM])
    vi.mocked(discoveryModule.discoverCoverage).mockResolvedValue({
      candidates: [
        { outlet: 'Novinky', title: 'T', url: 'https://novinky.cz/x', publishedAt: '2026-01-01T00:00:00Z' },
      ],
      gdeltCount: 5,
    })
    vi.mocked(coverageRepo.findRecentAnalysisMatchingUrls).mockResolvedValue(null)
    vi.mocked(analysisRepo.createDraftAnalysis).mockResolvedValue({
      id: 'draft-1',
      storyId: 'story-1',
      seedUrl: RSS_ITEM.url,
      seedHeadline: 'Fresh headline',
      status: 'DRAFT',
      createdAt: new Date(),
    })

    const summary = await runIngestionPass()

    expect(analysisRepo.createDraftAnalysis).toHaveBeenCalledWith({
      seedUrl: RSS_ITEM.url,
      seedHeadline: 'Fresh headline',
    })
    expect(coverageRepo.createCoverages).toHaveBeenCalledWith([
      {
        analysisId: 'draft-1',
        outlet: 'Novinky',
        title: 'T',
        articleUrl: 'https://novinky.cz/x',
        publishedAt: '2026-01-01T00:00:00Z',
        status: 'PENDING',
      },
    ])
    expect(summary).toEqual({ checked: 1, created: 1, attached: 0, flagged: 0, skipped: 0 })
  })

  it('attaches as Coverage to an existing DRAFT or PENDING Analysis instead of creating a new one', async () => {
    stubCommon()
    vi.mocked(rssModule.queryRssFeeds).mockResolvedValue([RSS_ITEM])
    vi.mocked(discoveryModule.discoverCoverage).mockResolvedValue({ candidates: [], gdeltCount: 0 })
    vi.mocked(coverageRepo.findRecentAnalysisMatchingUrls).mockResolvedValue({
      analysisId: 'existing-1',
      status: 'PENDING',
      anchorHeadline: 'Fresh headline',
    })

    const summary = await runIngestionPass()

    expect(analysisRepo.createDraftAnalysis).not.toHaveBeenCalled()
    expect(coverageRepo.createCoverages).toHaveBeenCalledWith([
      {
        analysisId: 'existing-1',
        outlet: RSS_ITEM.outlet,
        title: RSS_ITEM.title,
        articleUrl: RSS_ITEM.url,
        publishedAt: RSS_ITEM.publishedAt,
        status: 'PENDING',
      },
    ])
    expect(summary).toEqual({ checked: 1, created: 0, attached: 1, flagged: 0, skipped: 0 })
  })

  it('does not lose a genuinely novel candidate just because it also surfaced as an unattached search candidate for an earlier matched item in the same poll', async () => {
    // Regression: a verified dedup match only ever attaches item.url as Coverage — its other
    // Discovery search candidates were never verified against anything and must stay eligible
    // for a later item in the same poll to attach them for real, if that later item's own
    // candidate check confirms them.
    stubCommon()
    const ITEM_A = {
      outlet: 'iDnes',
      title: 'Item A headline',
      url: 'https://idnes.cz/item-a',
      publishedAt: '2026-01-01T00:00:00Z',
    }
    const ITEM_B = {
      outlet: 'Novinky',
      title: 'Item B headline',
      url: 'https://novinky.cz/item-b',
      publishedAt: '2026-01-01T00:00:00Z',
    }
    const SHARED_CANDIDATE = {
      outlet: 'ČT24',
      title: 'Shared candidate',
      url: 'https://ct24.cz/shared-candidate',
      publishedAt: '2026-01-01T00:00:00Z',
    }
    vi.mocked(rssModule.queryRssFeeds).mockResolvedValue([ITEM_A, ITEM_B])
    vi.mocked(articleScraperModule.scrapeArticle)
      .mockResolvedValueOnce({ title: 'Item A headline', excerpt: 'e', fullText: 'f' })
      .mockResolvedValueOnce({ title: 'Item B headline', excerpt: 'e', fullText: 'f' })
    vi.mocked(discoveryModule.discoverCoverage).mockResolvedValue({
      candidates: [SHARED_CANDIDATE],
      gdeltCount: 5,
    })
    vi.mocked(coverageRepo.findRecentAnalysisMatchingUrls)
      .mockResolvedValueOnce({
        analysisId: 'existing-1',
        status: 'PENDING',
        anchorHeadline: 'Item A headline',
      })
      .mockResolvedValueOnce(null)
    vi.mocked(storyVerificationModule.verifyCandidatesAgainstAnchor).mockImplementation((candidates) =>
      Promise.resolve(candidates)
    )
    vi.mocked(analysisRepo.createDraftAnalysis).mockResolvedValue({
      id: 'draft-8',
      storyId: 'story-8',
      seedUrl: ITEM_B.url,
      seedHeadline: 'Item B headline',
      status: 'DRAFT',
      createdAt: new Date(),
    })

    await runIngestionPass()

    // Item A attaches only its own URL — the shared candidate is not attached here.
    expect(coverageRepo.createCoverages).toHaveBeenCalledWith([
      expect.objectContaining({ analysisId: 'existing-1', articleUrl: ITEM_A.url }),
    ])
    // Item B's own candidate check still sees the shared candidate and attaches it.
    expect(storyVerificationModule.verifyCandidatesAgainstAnchor).toHaveBeenCalledWith(
      [SHARED_CANDIDATE],
      'Item B headline',
      undefined
    )
    expect(coverageRepo.createCoverages).toHaveBeenCalledWith([
      expect.objectContaining({ analysisId: 'draft-8', articleUrl: SHARED_CANDIDATE.url }),
    ])
  })

  it('flags a possible addition instead of modifying a matched COMPLETE Analysis', async () => {
    stubCommon()
    vi.mocked(rssModule.queryRssFeeds).mockResolvedValue([RSS_ITEM])
    vi.mocked(discoveryModule.discoverCoverage).mockResolvedValue({ candidates: [], gdeltCount: 0 })
    vi.mocked(coverageRepo.findRecentAnalysisMatchingUrls).mockResolvedValue({
      analysisId: 'completed-1',
      status: 'COMPLETE',
      anchorHeadline: 'Fresh headline',
    })

    const summary = await runIngestionPass()

    expect(coverageRepo.createCoverages).not.toHaveBeenCalled()
    expect(pendingAdditionRepo.createPendingAddition).toHaveBeenCalledWith({
      analysisId: 'completed-1',
      outlet: RSS_ITEM.outlet,
      title: RSS_ITEM.title,
      articleUrl: RSS_ITEM.url,
      publishedAt: RSS_ITEM.publishedAt,
    })
    expect(summary).toEqual({ checked: 1, created: 0, attached: 0, flagged: 1, skipped: 0 })
  })

  it('skips without side effects when the match is against a FAILED (rejected) Analysis', async () => {
    stubCommon()
    vi.mocked(rssModule.queryRssFeeds).mockResolvedValue([RSS_ITEM])
    vi.mocked(discoveryModule.discoverCoverage).mockResolvedValue({ candidates: [], gdeltCount: 0 })
    vi.mocked(coverageRepo.findRecentAnalysisMatchingUrls).mockResolvedValue({
      analysisId: 'failed-1',
      status: 'FAILED',
      anchorHeadline: 'Fresh headline',
    })

    const summary = await runIngestionPass()

    expect(coverageRepo.createCoverages).not.toHaveBeenCalled()
    expect(pendingAdditionRepo.createPendingAddition).not.toHaveBeenCalled()
    expect(analysisRepo.createDraftAnalysis).not.toHaveBeenCalled()
    expect(summary).toEqual({ checked: 1, created: 0, attached: 0, flagged: 0, skipped: 1 })
  })

  it('skips an item that fails to scrape or keyword-extract without aborting the pass', async () => {
    stubCommon()
    vi.mocked(rssModule.queryRssFeeds).mockResolvedValue([
      RSS_ITEM,
      {
        outlet: 'Novinky',
        title: 'Second',
        url: 'https://novinky.cz/second',
        publishedAt: '2026-01-01T00:00:00Z',
      },
    ])
    vi.mocked(articleScraperModule.scrapeArticle)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ title: 'Second', excerpt: 'excerpt', fullText: 'full text' })
    vi.mocked(discoveryModule.discoverCoverage).mockResolvedValue({ candidates: [], gdeltCount: 0 })
    vi.mocked(coverageRepo.findRecentAnalysisMatchingUrls).mockResolvedValue(null)
    vi.mocked(analysisRepo.createDraftAnalysis).mockResolvedValue({
      id: 'draft-2',
      storyId: 'story-2',
      seedUrl: 'https://novinky.cz/second',
      seedHeadline: 'Second',
      status: 'DRAFT',
      createdAt: new Date(),
    })

    const summary = await runIngestionPass()

    expect(summary).toEqual({ checked: 2, created: 1, attached: 0, flagged: 0, skipped: 1 })
  })

  it('does not trust RSS-fallback-only candidates for the dedup match', async () => {
    // Regression: when GDELT is unreachable, discoverCoverage falls back to "whatever's
    // currently trending" unfiltered by keyword. Those candidates must not be used to decide
    // this item is the same Story as something else — only GDELT-confirmed candidates count.
    stubCommon()
    vi.mocked(rssModule.queryRssFeeds).mockResolvedValue([RSS_ITEM])
    vi.mocked(discoveryModule.discoverCoverage).mockResolvedValue({
      candidates: [
        {
          outlet: 'Novinky',
          title: 'Unrelated',
          url: 'https://novinky.cz/unrelated',
          publishedAt: '2026-01-01T00:00:00Z',
        },
      ],
      gdeltCount: 0,
    })
    vi.mocked(coverageRepo.findRecentAnalysisMatchingUrls).mockResolvedValue(null)
    vi.mocked(analysisRepo.createDraftAnalysis).mockResolvedValue({
      id: 'draft-3',
      storyId: 'story-3',
      seedUrl: RSS_ITEM.url,
      seedHeadline: 'Fresh headline',
      status: 'DRAFT',
      createdAt: new Date(),
    })

    await runIngestionPass()

    expect(coverageRepo.findRecentAnalysisMatchingUrls).toHaveBeenCalledWith([], 48)
    expect(analysisRepo.createDraftAnalysis).toHaveBeenCalled()
  })

  it('does not attach Coverage sourced from unrelated candidates to a brand-new Draft (regression)', async () => {
    // Regression for the confirmed production bug: a Draft's own candidate Coverage — sourced
    // from GDELT/RSS, not from an existing-Analysis dedup match — must be verified against the
    // triggering article before being persisted, or unrelated trending items become Coverage.
    stubCommon()
    vi.mocked(rssModule.queryRssFeeds).mockResolvedValue([RSS_ITEM])
    vi.mocked(discoveryModule.discoverCoverage).mockResolvedValue({
      candidates: [
        {
          outlet: 'Novinky',
          title: 'Related',
          url: 'https://novinky.cz/related',
          publishedAt: '2026-01-01T00:00:00Z',
        },
        {
          outlet: 'ČT24',
          title: 'D8 kamion havaroval',
          url: 'https://ct24.cz/d8',
          publishedAt: '2026-01-01T00:00:00Z',
        },
      ],
      gdeltCount: 5,
    })
    vi.mocked(coverageRepo.findRecentAnalysisMatchingUrls).mockResolvedValue(null)
    vi.mocked(storyVerificationModule.verifyCandidatesAgainstAnchor).mockImplementation((candidates) =>
      Promise.resolve(candidates.filter((c) => c.title === 'Related'))
    )
    vi.mocked(analysisRepo.createDraftAnalysis).mockResolvedValue({
      id: 'draft-4',
      storyId: 'story-4',
      seedUrl: RSS_ITEM.url,
      seedHeadline: 'Fresh headline',
      status: 'DRAFT',
      createdAt: new Date(),
    })

    await runIngestionPass()

    expect(coverageRepo.createCoverages).toHaveBeenCalledWith([
      {
        analysisId: 'draft-4',
        outlet: 'Novinky',
        title: 'Related',
        articleUrl: 'https://novinky.cz/related',
        publishedAt: '2026-01-01T00:00:00Z',
        status: 'PENDING',
      },
    ])
  })

  it('excludes an already-known URL from a new Draft candidate list without re-verifying it', async () => {
    // Regression: a URL that's already real Coverage (from an earlier item in this same poll,
    // or a prior poll) must not be re-attached to a second Analysis just because this item's
    // own candidate check (comparing the candidate to *this* item's title) independently accepts
    // it — the dedup-match check above compares a different pair and can legitimately disagree.
    stubCommon()
    vi.mocked(rssModule.queryRssFeeds).mockResolvedValue([RSS_ITEM])
    vi.mocked(coverageRepo.findAllArticleUrls).mockResolvedValue(['https://novinky.cz/already-covered'])
    vi.mocked(discoveryModule.discoverCoverage).mockResolvedValue({
      candidates: [
        {
          outlet: 'Novinky',
          title: 'Already covered elsewhere',
          url: 'https://novinky.cz/already-covered',
          publishedAt: '2026-01-01T00:00:00Z',
        },
        {
          outlet: 'ČT24',
          title: 'Genuinely new',
          url: 'https://ct24.cz/new',
          publishedAt: '2026-01-01T00:00:00Z',
        },
      ],
      gdeltCount: 5,
    })
    vi.mocked(coverageRepo.findRecentAnalysisMatchingUrls).mockResolvedValue(null)
    vi.mocked(analysisRepo.createDraftAnalysis).mockResolvedValue({
      id: 'draft-7',
      storyId: 'story-7',
      seedUrl: RSS_ITEM.url,
      seedHeadline: 'Fresh headline',
      status: 'DRAFT',
      createdAt: new Date(),
    })

    await runIngestionPass()

    expect(storyVerificationModule.verifyCandidatesAgainstAnchor).toHaveBeenCalledWith(
      [
        {
          outlet: 'ČT24',
          title: 'Genuinely new',
          url: 'https://ct24.cz/new',
          publishedAt: '2026-01-01T00:00:00Z',
        },
      ],
      'Fresh headline',
      undefined
    )
    expect(coverageRepo.createCoverages).toHaveBeenCalledWith([
      {
        analysisId: 'draft-7',
        outlet: 'ČT24',
        title: 'Genuinely new',
        articleUrl: 'https://ct24.cz/new',
        publishedAt: '2026-01-01T00:00:00Z',
        status: 'PENDING',
      },
    ])
  })

  it('falls through to creating a new Draft when the dedup match fails same-story verification', async () => {
    stubCommon()
    vi.mocked(rssModule.queryRssFeeds).mockResolvedValue([RSS_ITEM])
    vi.mocked(discoveryModule.discoverCoverage).mockResolvedValue({ candidates: [], gdeltCount: 5 })
    vi.mocked(coverageRepo.findRecentAnalysisMatchingUrls).mockResolvedValue({
      analysisId: 'existing-1',
      status: 'PENDING',
      anchorHeadline: 'A completely different story',
    })
    vi.mocked(storyVerificationModule.verifySameStoryLogged).mockResolvedValue(DIFFERENT_EVENT)
    vi.mocked(analysisRepo.createDraftAnalysis).mockResolvedValue({
      id: 'draft-5',
      storyId: 'story-5',
      seedUrl: RSS_ITEM.url,
      seedHeadline: 'Fresh headline',
      status: 'DRAFT',
      createdAt: new Date(),
    })

    const summary = await runIngestionPass()

    expect(coverageRepo.createCoverages).not.toHaveBeenCalledWith([
      expect.objectContaining({ analysisId: 'existing-1' }),
    ])
    expect(pendingAdditionRepo.createPendingAddition).not.toHaveBeenCalled()
    expect(analysisRepo.createDraftAnalysis).toHaveBeenCalledWith({
      seedUrl: RSS_ITEM.url,
      seedHeadline: 'Fresh headline',
    })
    expect(summary).toEqual({ checked: 1, created: 1, attached: 0, flagged: 0, skipped: 0 })
  })

  it('verifies same-story before flagging a possible addition against a COMPLETE Analysis', async () => {
    stubCommon()
    vi.mocked(rssModule.queryRssFeeds).mockResolvedValue([RSS_ITEM])
    vi.mocked(discoveryModule.discoverCoverage).mockResolvedValue({ candidates: [], gdeltCount: 5 })
    vi.mocked(coverageRepo.findRecentAnalysisMatchingUrls).mockResolvedValue({
      analysisId: 'completed-1',
      status: 'COMPLETE',
      anchorHeadline: 'A completely different story',
    })
    vi.mocked(storyVerificationModule.verifySameStoryLogged).mockResolvedValue(DIFFERENT_EVENT)
    vi.mocked(analysisRepo.createDraftAnalysis).mockResolvedValue({
      id: 'draft-6',
      storyId: 'story-6',
      seedUrl: RSS_ITEM.url,
      seedHeadline: 'Fresh headline',
      status: 'DRAFT',
      createdAt: new Date(),
    })

    const summary = await runIngestionPass()

    expect(pendingAdditionRepo.createPendingAddition).not.toHaveBeenCalled()
    expect(summary.flagged).toBe(0)
    expect(summary.created).toBe(1)
  })
})

describe('approveDraft', () => {
  beforeEach(() => vi.resetAllMocks())

  it('flips a Draft to PENDING', async () => {
    vi.mocked(analysisRepo.findAnalysisById).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'x',
      seedHeadline: 'x',
      status: 'DRAFT',
      createdAt: new Date(),
    })

    await approveDraft('a1')

    expect(analysisRepo.updateAnalysisStatus).toHaveBeenCalledWith('a1', 'PENDING')
  })

  it('throws NotFoundError when the Analysis does not exist', async () => {
    vi.mocked(analysisRepo.findAnalysisById).mockResolvedValue(null)

    await expect(approveDraft('missing')).rejects.toThrow(NotFoundError)
  })

  it('throws ValidationError when the Analysis is not a Draft', async () => {
    vi.mocked(analysisRepo.findAnalysisById).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'x',
      seedHeadline: 'x',
      status: 'COMPLETE',
      createdAt: new Date(),
    })

    await expect(approveDraft('a1')).rejects.toThrow(ValidationError)
  })
})

describe('rejectDraft', () => {
  beforeEach(() => vi.resetAllMocks())

  it('flips a Draft to FAILED so it is marked, not deleted', async () => {
    vi.mocked(analysisRepo.findAnalysisById).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'x',
      seedHeadline: 'x',
      status: 'DRAFT',
      createdAt: new Date(),
    })

    await rejectDraft('a1')

    expect(analysisRepo.updateAnalysisStatus).toHaveBeenCalledWith('a1', 'FAILED')
  })

  it('throws ValidationError when the Analysis is not a Draft', async () => {
    vi.mocked(analysisRepo.findAnalysisById).mockResolvedValue({
      id: 'a1',
      storyId: 's1',
      seedUrl: 'x',
      seedHeadline: 'x',
      status: 'FAILED',
      createdAt: new Date(),
    })

    await expect(rejectDraft('a1')).rejects.toThrow(ValidationError)
  })
})

describe('listPendingAdditions', () => {
  beforeEach(() => vi.resetAllMocks())

  it('maps repository rows to PendingAdditionItems', async () => {
    vi.mocked(pendingAdditionRepo.findAllPendingAdditions).mockResolvedValue([
      {
        id: 'p1',
        analysisId: 'a1',
        outlet: 'iDnes',
        title: 'T',
        articleUrl: 'https://idnes.cz/x',
        publishedAt: '2026-01-01T00:00:00Z',
        createdAt: new Date('2026-01-02T00:00:00Z'),
        analysis: { seedHeadline: 'Original story' },
      },
    ])

    const result = await listPendingAdditions()

    expect(result).toEqual([
      {
        id: 'p1',
        analysisId: 'a1',
        analysisSeedHeadline: 'Original story',
        outlet: 'iDnes',
        title: 'T',
        articleUrl: 'https://idnes.cz/x',
        publishedAt: '2026-01-01T00:00:00Z',
        createdAt: '2026-01-02T00:00:00.000Z',
      },
    ])
  })
})
