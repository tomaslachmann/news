import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as analysisRepo from '../repositories/analysis.js'
import * as coverageRepo from '../repositories/coverage.js'
import * as pendingAdditionRepo from '../repositories/pendingAddition.js'
import * as rssModule from './rss.js'
import * as embeddingClientModule from './embeddingClient.js'
import { runIngestionPass, approveDraft, rejectDraft, listPendingAdditions } from './ingestionService.js'
import { NotFoundError, ValidationError } from '../errors.js'

vi.mock('../repositories/analysis.js')
vi.mock('../repositories/coverage.js')
vi.mock('../repositories/pendingAddition.js')
vi.mock('./rss.js')
vi.mock('./embeddingClient.js')

const RSS_ITEM = {
  outlet: 'iDnes',
  title: 'Fresh headline',
  url: 'https://idnes.cz/fresh-article',
  publishedAt: '2026-01-01T00:00:00Z',
}

const ITEM_EMBEDDING = [1, 0, 0]
const MATCHING_EMBEDDING = [1, 0, 0] // identical vector — cosine similarity 1.0
const UNRELATED_EMBEDDING = [0, 1, 0] // orthogonal — cosine similarity 0.0

function stubCommon() {
  vi.mocked(analysisRepo.findAllSeedUrls).mockResolvedValue([])
  vi.mocked(coverageRepo.findAllArticleUrls).mockResolvedValue([])
  vi.mocked(embeddingClientModule.generateEmbedding).mockResolvedValue(ITEM_EMBEDDING)
  vi.mocked(analysisRepo.findRecentStoriesForMatching).mockResolvedValue([])
}

describe('runIngestionPass', () => {
  beforeEach(() => vi.resetAllMocks())

  it('skips an RSS item whose URL is already a known Seed Article or Coverage', async () => {
    vi.mocked(rssModule.queryRssFeeds).mockResolvedValue([RSS_ITEM])
    vi.mocked(analysisRepo.findAllSeedUrls).mockResolvedValue([RSS_ITEM.url])
    vi.mocked(coverageRepo.findAllArticleUrls).mockResolvedValue([])

    const summary = await runIngestionPass()

    expect(summary).toEqual({ checked: 1, created: 0, attached: 0, flagged: 0, skipped: 1 })
    expect(embeddingClientModule.generateEmbedding).not.toHaveBeenCalled()
  })

  it('creates a new Draft Analysis, seeded with only its own Coverage, when nothing matches', async () => {
    stubCommon()
    vi.mocked(rssModule.queryRssFeeds).mockResolvedValue([RSS_ITEM])
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
      embedding: ITEM_EMBEDDING,
    })
    expect(coverageRepo.createCoverages).toHaveBeenCalledWith([
      {
        analysisId: 'draft-1',
        outlet: RSS_ITEM.outlet,
        title: RSS_ITEM.title,
        articleUrl: RSS_ITEM.url,
        publishedAt: RSS_ITEM.publishedAt,
        status: 'PENDING',
      },
    ])
    expect(summary).toEqual({ checked: 1, created: 1, attached: 0, flagged: 0, skipped: 0 })
  })

  it('lets a Story created earlier in the same poll be matched by a later item in that same poll', async () => {
    // Regression: candidates are fetched once per poll, not once per item, for efficiency — but
    // a Story created by an earlier item in this same run must still be visible to a later
    // item's own match check, exactly as when candidates were re-fetched every time.
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
    vi.mocked(rssModule.queryRssFeeds).mockResolvedValue([ITEM_A, ITEM_B])
    vi.mocked(analysisRepo.createDraftAnalysis).mockResolvedValue({
      id: 'draft-a',
      storyId: 'story-a',
      seedUrl: ITEM_A.url,
      seedHeadline: 'Item A headline',
      status: 'DRAFT',
      createdAt: new Date(),
    })

    const summary = await runIngestionPass()

    expect(analysisRepo.createDraftAnalysis).toHaveBeenCalledTimes(1)
    expect(coverageRepo.createCoverages).toHaveBeenCalledWith([
      expect.objectContaining({ analysisId: 'draft-a', articleUrl: ITEM_B.url }),
    ])
    expect(summary).toEqual({ checked: 2, created: 1, attached: 1, flagged: 0, skipped: 0 })
  })

  it('attaches as Coverage to a matching DRAFT or PENDING Analysis instead of creating a new one', async () => {
    stubCommon()
    vi.mocked(rssModule.queryRssFeeds).mockResolvedValue([RSS_ITEM])
    vi.mocked(analysisRepo.findRecentStoriesForMatching).mockResolvedValue([
      {
        storyId: 'story-x',
        analysisId: 'existing-1',
        analysisStatus: 'PENDING',
        embedding: MATCHING_EMBEDDING,
        createdAt: new Date(),
      },
    ])

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

  it('flags a possible addition instead of modifying a matched COMPLETE Analysis', async () => {
    stubCommon()
    vi.mocked(rssModule.queryRssFeeds).mockResolvedValue([RSS_ITEM])
    vi.mocked(analysisRepo.findRecentStoriesForMatching).mockResolvedValue([
      {
        storyId: 'story-x',
        analysisId: 'completed-1',
        analysisStatus: 'COMPLETE',
        embedding: MATCHING_EMBEDDING,
        createdAt: new Date(),
      },
    ])

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
    vi.mocked(analysisRepo.findRecentStoriesForMatching).mockResolvedValue([
      {
        storyId: 'story-x',
        analysisId: 'failed-1',
        analysisStatus: 'FAILED',
        embedding: MATCHING_EMBEDDING,
        createdAt: new Date(),
      },
    ])

    const summary = await runIngestionPass()

    expect(coverageRepo.createCoverages).not.toHaveBeenCalled()
    expect(pendingAdditionRepo.createPendingAddition).not.toHaveBeenCalled()
    expect(analysisRepo.createDraftAnalysis).not.toHaveBeenCalled()
    expect(summary).toEqual({ checked: 1, created: 0, attached: 0, flagged: 0, skipped: 1 })
  })

  it('does not match a candidate whose embedding is unrelated, creating a new Draft instead', async () => {
    stubCommon()
    vi.mocked(rssModule.queryRssFeeds).mockResolvedValue([RSS_ITEM])
    vi.mocked(analysisRepo.findRecentStoriesForMatching).mockResolvedValue([
      {
        storyId: 'story-x',
        analysisId: 'unrelated-1',
        analysisStatus: 'PENDING',
        embedding: UNRELATED_EMBEDDING,
        createdAt: new Date(),
      },
    ])
    vi.mocked(analysisRepo.createDraftAnalysis).mockResolvedValue({
      id: 'draft-2',
      storyId: 'story-2',
      seedUrl: RSS_ITEM.url,
      seedHeadline: 'Fresh headline',
      status: 'DRAFT',
      createdAt: new Date(),
    })

    const summary = await runIngestionPass()

    expect(coverageRepo.createCoverages).not.toHaveBeenCalledWith([
      expect.objectContaining({ analysisId: 'unrelated-1' }),
    ])
    expect(analysisRepo.createDraftAnalysis).toHaveBeenCalled()
    expect(summary.created).toBe(1)
  })

  it('lets time decay prevent a match against an otherwise-identical but very old Story', async () => {
    // A candidate with a perfect similarity score (identical embedding) but from weeks ago must
    // still fail to match — otherwise "Trump announced new tariffs" three weeks apart would keep
    // re-attaching to the same stale Story forever. See ADR 0018.
    stubCommon()
    vi.mocked(rssModule.queryRssFeeds).mockResolvedValue([RSS_ITEM])
    const veryOld = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    vi.mocked(analysisRepo.findRecentStoriesForMatching).mockResolvedValue([
      {
        storyId: 'story-x',
        analysisId: 'stale-1',
        analysisStatus: 'PENDING',
        embedding: MATCHING_EMBEDDING,
        createdAt: veryOld,
      },
    ])
    vi.mocked(analysisRepo.createDraftAnalysis).mockResolvedValue({
      id: 'draft-3',
      storyId: 'story-3',
      seedUrl: RSS_ITEM.url,
      seedHeadline: 'Fresh headline',
      status: 'DRAFT',
      createdAt: new Date(),
    })

    const summary = await runIngestionPass()

    expect(coverageRepo.createCoverages).not.toHaveBeenCalledWith([
      expect.objectContaining({ analysisId: 'stale-1' }),
    ])
    expect(analysisRepo.createDraftAnalysis).toHaveBeenCalled()
    expect(summary.created).toBe(1)
  })

  it('skips an item whose embedding generation fails, without aborting the rest of the pass', async () => {
    stubCommon()
    const secondItem = {
      outlet: 'Novinky',
      title: 'Second',
      url: 'https://novinky.cz/second',
      publishedAt: '2026-01-01T00:00:00Z',
    }
    vi.mocked(rssModule.queryRssFeeds).mockResolvedValue([RSS_ITEM, secondItem])
    vi.mocked(embeddingClientModule.generateEmbedding)
      .mockRejectedValueOnce(new Error('embeddings API down'))
      .mockResolvedValueOnce(ITEM_EMBEDDING)
    vi.mocked(analysisRepo.createDraftAnalysis).mockResolvedValue({
      id: 'draft-4',
      storyId: 'story-4',
      seedUrl: secondItem.url,
      seedHeadline: 'Second',
      status: 'DRAFT',
      createdAt: new Date(),
    })

    const summary = await runIngestionPass()

    expect(summary).toEqual({ checked: 2, created: 1, attached: 0, flagged: 0, skipped: 1 })
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
