import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as analysisRepo from '../repositories/analysis.js'
import * as coverageRepo from '../repositories/coverage.js'
import * as pendingAdditionRepo from '../repositories/pendingAddition.js'
import * as rssModule from './rss.js'
import * as embeddingClientModule from './embeddingClient.js'
import * as storyVerificationModule from './storyVerification.js'
import {
  runIngestionPass,
  approveDraft,
  rejectDraft,
  listPendingAdditions,
  listVisibleDrafts,
} from './ingestionService.js'
import { NotFoundError, ValidationError } from '../errors.js'

vi.mock('../repositories/analysis.js')
vi.mock('../repositories/coverage.js')
vi.mock('../repositories/pendingAddition.js')
vi.mock('./rss.js')
vi.mock('./embeddingClient.js')
vi.mock('./storyVerification.js')

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
        anchorHeadline: 'Anchor headline',
        headline: null,
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
        anchorHeadline: 'Anchor headline',
        headline: null,
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
        anchorHeadline: 'Anchor headline',
        headline: null,
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
        anchorHeadline: 'Anchor headline',
        headline: null,
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
        anchorHeadline: 'Anchor headline',
        headline: null,
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

const DRAFT_WITH_STORY = {
  id: 'a1',
  storyId: 's1',
  seedUrl: 'x',
  seedHeadline: 'x',
  status: 'DRAFT' as const,
  createdAt: new Date(),
  story: { id: 's1', createdAt: new Date(), anchorHeadline: 'Anchor headline', embedding: [] },
}

function makeCoverage(id: string, title: string) {
  return {
    id,
    analysisId: 'a1',
    outlet: 'iDnes',
    title,
    articleUrl: `https://idnes.cz/${id}`,
    publishedAt: '2026-01-01T00:00:00Z',
    extractedText: null,
    extractionResult: null,
    status: 'PENDING' as const,
    excluded: false,
  }
}

function makeTitlelessCoverage(id: string) {
  return { ...makeCoverage(id, ''), title: null }
}

describe('approveDraft', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(analysisRepo.updateAnalysisStatusIfCurrently).mockResolvedValue(true)
  })

  it('flips a Draft to PENDING and excludes nothing when every Coverage verifies', async () => {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue(DRAFT_WITH_STORY)
    const coverages = [makeCoverage('c1', 'T1'), makeCoverage('c2', 'T2')]
    vi.mocked(coverageRepo.findCoveragesForAnalysis).mockResolvedValue(coverages)
    vi.mocked(storyVerificationModule.verifyCandidatesAgainstAnchorInBatches).mockResolvedValue(coverages)

    await approveDraft('a1')

    expect(storyVerificationModule.verifyCandidatesAgainstAnchorInBatches).toHaveBeenCalledWith(
      coverages,
      'Anchor headline',
      undefined
    )
    expect(coverageRepo.excludeCoverageIds).not.toHaveBeenCalled()
    expect(analysisRepo.updateAnalysisStatusIfCurrently).toHaveBeenCalledWith('a1', 'DRAFT', 'PENDING')
  })

  it('excludes only the specific Coverage that fails verification and proceeds to PENDING with the remainder', async () => {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue(DRAFT_WITH_STORY)
    const good = makeCoverage('c1', 'Related to the anchor')
    const bad = makeCoverage('c2', 'Unrelated trending item')
    vi.mocked(coverageRepo.findCoveragesForAnalysis).mockResolvedValue([good, bad])
    vi.mocked(storyVerificationModule.verifyCandidatesAgainstAnchorInBatches).mockResolvedValue([good])

    await approveDraft('a1')

    expect(coverageRepo.excludeCoverageIds).toHaveBeenCalledWith(['c2'])
    expect(analysisRepo.updateAnalysisStatusIfCurrently).toHaveBeenCalledWith('a1', 'DRAFT', 'PENDING')
  })

  it('still proceeds to PENDING when every Coverage fails verification, without throwing', async () => {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue(DRAFT_WITH_STORY)
    const coverages = [makeCoverage('c1', 'Unrelated'), makeCoverage('c2', 'Also unrelated')]
    vi.mocked(coverageRepo.findCoveragesForAnalysis).mockResolvedValue(coverages)
    vi.mocked(storyVerificationModule.verifyCandidatesAgainstAnchorInBatches).mockResolvedValue([])

    await approveDraft('a1')

    expect(coverageRepo.excludeCoverageIds).toHaveBeenCalledWith(['c1', 'c2'])
    expect(analysisRepo.updateAnalysisStatusIfCurrently).toHaveBeenCalledWith('a1', 'DRAFT', 'PENDING')
  })

  it('never sends a title-less Coverage to verification, treating it as unverifiable', async () => {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue(DRAFT_WITH_STORY)
    const titled = makeCoverage('c1', 'T1')
    const titleless = makeTitlelessCoverage('c2')
    vi.mocked(coverageRepo.findCoveragesForAnalysis).mockResolvedValue([titled, titleless])
    vi.mocked(storyVerificationModule.verifyCandidatesAgainstAnchorInBatches).mockResolvedValue([titled])

    await approveDraft('a1')

    expect(storyVerificationModule.verifyCandidatesAgainstAnchorInBatches).toHaveBeenCalledWith(
      [titled],
      'Anchor headline',
      undefined
    )
    expect(coverageRepo.excludeCoverageIds).toHaveBeenCalledWith(['c2'])
  })

  it('does not resurrect a Draft that was concurrently rejected while verification was in flight', async () => {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue(DRAFT_WITH_STORY)
    const coverages = [makeCoverage('c1', 'T1')]
    vi.mocked(coverageRepo.findCoveragesForAnalysis).mockResolvedValue(coverages)
    vi.mocked(storyVerificationModule.verifyCandidatesAgainstAnchorInBatches).mockResolvedValue(coverages)
    vi.mocked(analysisRepo.updateAnalysisStatusIfCurrently).mockResolvedValue(false)

    await expect(approveDraft('a1')).resolves.toBeUndefined()

    expect(analysisRepo.updateAnalysisStatusIfCurrently).toHaveBeenCalledWith('a1', 'DRAFT', 'PENDING')
  })

  it('throws NotFoundError when the Analysis does not exist', async () => {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue(null)

    await expect(approveDraft('missing')).rejects.toThrow(NotFoundError)
  })

  it('throws ValidationError when the Analysis is not a Draft', async () => {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue({
      ...DRAFT_WITH_STORY,
      status: 'COMPLETE',
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

describe('listVisibleDrafts', () => {
  beforeEach(() => vi.resetAllMocks())

  it('excludes a Draft below the minimum source count', async () => {
    vi.mocked(analysisRepo.findDraftsWithCoverageCount).mockResolvedValue([
      {
        id: 'd1',
        seedHeadline: 'Single-source draft',
        headline: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        coverageCount: 1,
      },
    ])

    const result = await listVisibleDrafts()

    expect(result).toEqual([])
  })

  it('includes a Draft that has crossed the minimum source count', async () => {
    vi.mocked(analysisRepo.findDraftsWithCoverageCount).mockResolvedValue([
      {
        id: 'd1',
        seedHeadline: 'Corroborated draft',
        headline: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        coverageCount: 2,
      },
    ])

    const result = await listVisibleDrafts()

    expect(result).toEqual([
      {
        id: 'd1',
        seedHeadline: 'Corroborated draft',
        title: 'Corroborated draft',
        createdAt: '2026-01-01T00:00:00.000Z',
        coverageCount: 2,
        status: 'draft',
      },
    ])
  })

  it('mixes visible and hidden Drafts correctly in the same response', async () => {
    vi.mocked(analysisRepo.findDraftsWithCoverageCount).mockResolvedValue([
      { id: 'hidden', seedHeadline: 'Hidden', headline: null, createdAt: new Date(), coverageCount: 1 },
      { id: 'visible', seedHeadline: 'Visible', headline: null, createdAt: new Date(), coverageCount: 3 },
    ])

    const result = await listVisibleDrafts()

    expect(result.map((d) => d.id)).toEqual(['visible'])
  })
})
