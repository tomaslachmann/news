import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { FastifyBaseLogger } from 'fastify'
import * as analysisRepo from '../repositories/analysis.js'
import * as coverageRepo from '../repositories/coverage.js'
import * as pendingAdditionRepo from '../repositories/pendingAddition.js'
import * as rssModule from './rss.js'
import * as embeddingClientModule from './embeddingClient.js'
import * as storyVerificationModule from './storyVerification.js'
import * as storyRelationRepo from '../repositories/storyRelation.js'
import * as matchDecisionRepo from '../repositories/matchDecision.js'
import * as ingestionRunLockRepo from '../repositories/ingestionRunLock.js'
import * as synthesisResultRepo from '../repositories/synthesisResult.js'
import * as articleScraperModule from './articleScraper.js'
import * as jobsEnqueue from '../jobs/enqueue.js'
import * as adminActionLogRepo from '../repositories/adminActionLog.js'
import { JobName } from '../jobs/jobDefinitions.js'
import {
  runIngestionPass,
  approveDraft,
  rejectDraft,
  listPendingAdditions,
  approvePendingAddition,
  rejectPendingAddition,
  listVisibleDrafts,
  listPendingStoryRelations,
  approveStoryRelation,
  rejectStoryRelation,
} from './ingestionService.js'
import { NotFoundError, ValidationError } from '../errors.js'

vi.mock('../repositories/analysis.js')
vi.mock('../repositories/coverage.js')
vi.mock('../repositories/pendingAddition.js')
vi.mock('./rss.js')
vi.mock('./embeddingClient.js')
vi.mock('./storyVerification.js')
vi.mock('../repositories/storyRelation.js')
vi.mock('../repositories/matchDecision.js')
vi.mock('../repositories/ingestionRunLock.js')
vi.mock('../repositories/synthesisResult.js')
vi.mock('./articleScraper.js')
vi.mock('../jobs/enqueue.js')
vi.mock('../repositories/adminActionLog.js')

const ACTOR_ID = 'admin1'

const RSS_ITEM = {
  sourceId: 'src-idnes',
  outlet: 'iDnes',
  title: 'Fresh headline',
  url: 'https://idnes.cz/fresh-article',
  publishedAt: '2026-01-01T00:00:00Z',
}

const ITEM_EMBEDDING = [1, 0, 0]
const ITEM_EMBEDDING_RESULT = {
  vector: ITEM_EMBEDDING,
  model: 'text-embedding-3-small',
  inputHash: 'hash-item',
}
const MATCHING_EMBEDDING = [1, 0, 0] // identical vector — cosine similarity 1.0
const UNRELATED_EMBEDDING = [0, 1, 0] // orthogonal — cosine similarity 0.0

function stubCommon() {
  vi.mocked(analysisRepo.findAllSeedUrls).mockResolvedValue([])
  vi.mocked(coverageRepo.findAllArticleUrls).mockResolvedValue([])
  vi.mocked(embeddingClientModule.generateEmbedding).mockResolvedValue(ITEM_EMBEDDING_RESULT)
  vi.mocked(analysisRepo.findRecentStoriesForMatching).mockResolvedValue([])
  // No Coverage from this Source on the matched Analysis yet — the collision check (P0-6,
  // docs/audit.md) lets the attach through. Tests exercising the duplicate-skip path override this.
  vi.mocked(coverageRepo.findCoveragesForAnalysis).mockResolvedValue([])
  vi.mocked(coverageRepo.addCoveragesIfWithinLimit).mockResolvedValue({ ok: true })
  // P2-22 (docs/audit.md): every test exercises a normal, successfully-claimed run unless it
  // explicitly overrides this to test the lock-contention path itself.
  vi.mocked(ingestionRunLockRepo.tryClaimIngestionLock).mockResolvedValue('run-1')
  vi.mocked(ingestionRunLockRepo.releaseIngestionLock).mockResolvedValue(undefined)
}

describe('runIngestionPass', () => {
  beforeEach(() => vi.resetAllMocks())

  it('skips an RSS item whose URL is already a known Seed Article or Coverage', async () => {
    vi.mocked(ingestionRunLockRepo.tryClaimIngestionLock).mockResolvedValue('run-1')
    vi.mocked(rssModule.queryRssFeeds).mockResolvedValue([RSS_ITEM])
    vi.mocked(analysisRepo.findAllSeedUrls).mockResolvedValue([RSS_ITEM.url])
    vi.mocked(coverageRepo.findAllArticleUrls).mockResolvedValue([])

    const summary = await runIngestionPass()

    expect(summary).toEqual({ checked: 1, created: 0, attached: 0, flagged: 0, skipped: 1 })
    expect(embeddingClientModule.generateEmbedding).not.toHaveBeenCalled()
  })

  // P2-22 (docs/audit.md): a manual/admin-triggered run racing an in-flight scheduled one.
  it('does no work and returns an all-zero summary when the run lock is already held', async () => {
    vi.mocked(ingestionRunLockRepo.tryClaimIngestionLock).mockResolvedValue(null)

    const summary = await runIngestionPass()

    expect(summary).toEqual({ checked: 0, created: 0, attached: 0, flagged: 0, skipped: 0 })
    expect(rssModule.queryRssFeeds).not.toHaveBeenCalled()
    expect(ingestionRunLockRepo.releaseIngestionLock).not.toHaveBeenCalled()
  })

  it('releases the run lock with its own runId after a successful pass', async () => {
    stubCommon()
    vi.mocked(ingestionRunLockRepo.tryClaimIngestionLock).mockResolvedValue('run-42')
    vi.mocked(rssModule.queryRssFeeds).mockResolvedValue([])

    await runIngestionPass()

    expect(ingestionRunLockRepo.releaseIngestionLock).toHaveBeenCalledWith('run-42')
  })

  it('still releases the run lock when the pass itself throws', async () => {
    stubCommon()
    vi.mocked(ingestionRunLockRepo.tryClaimIngestionLock).mockResolvedValue('run-42')
    vi.mocked(rssModule.queryRssFeeds).mockRejectedValue(new Error('RSS feed down'))

    await expect(runIngestionPass()).rejects.toThrow('RSS feed down')

    expect(ingestionRunLockRepo.releaseIngestionLock).toHaveBeenCalledWith('run-42')
  })

  it("propagates the pass's own error, not a release failure, when both fail — a release failure must never mask the real root cause", async () => {
    stubCommon()
    vi.mocked(ingestionRunLockRepo.tryClaimIngestionLock).mockResolvedValue('run-42')
    vi.mocked(rssModule.queryRssFeeds).mockRejectedValue(new Error('RSS feed down'))
    vi.mocked(ingestionRunLockRepo.releaseIngestionLock).mockRejectedValue(new Error('DB down'))

    await expect(runIngestionPass()).rejects.toThrow('RSS feed down')
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
      eventTime: new Date(RSS_ITEM.publishedAt),
      embedding: ITEM_EMBEDDING,
      embeddingModel: ITEM_EMBEDDING_RESULT.model,
      embeddingInputHash: ITEM_EMBEDDING_RESULT.inputHash,
    })
    expect(coverageRepo.createCoverages).toHaveBeenCalledWith([
      {
        analysisId: 'draft-1',
        sourceId: RSS_ITEM.sourceId,
        title: RSS_ITEM.title,
        articleUrl: RSS_ITEM.url,
        publishedAt: RSS_ITEM.publishedAt,
        status: 'PENDING',
        primaryCategory: null,
      },
    ])
    expect(summary).toEqual({ checked: 1, created: 1, attached: 0, flagged: 0, skipped: 0 })
    expect(matchDecisionRepo.recordMatchDecisionSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        callSite: 'ingestion',
        candidateStoryId: null,
        thresholdMatched: false,
        llmVerdict: null,
        decidedBy: 'THRESHOLD',
      })
    )
  })

  it('lets a Story created earlier in the same poll be matched by a later item in that same poll', async () => {
    // Regression: candidates are fetched once per poll, not once per item, for efficiency — but
    // a Story created by an earlier item in this same run must still be visible to a later
    // item's own match check, exactly as when candidates were re-fetched every time.
    stubCommon()
    const ITEM_A = {
      sourceId: 'src-idnes',
      outlet: 'iDnes',
      title: 'Item A headline',
      url: 'https://idnes.cz/item-a',
      publishedAt: '2026-01-01T00:00:00Z',
    }
    const ITEM_B = {
      sourceId: 'src-novinky',
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
    expect(coverageRepo.addCoveragesIfWithinLimit).toHaveBeenCalledWith(
      'draft-a',
      [expect.objectContaining({ analysisId: 'draft-a', articleUrl: ITEM_B.url })],
      25
    )
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
    expect(coverageRepo.addCoveragesIfWithinLimit).toHaveBeenCalledWith(
      'existing-1',
      [
        {
          analysisId: 'existing-1',
          sourceId: RSS_ITEM.sourceId,
          title: RSS_ITEM.title,
          articleUrl: RSS_ITEM.url,
          publishedAt: RSS_ITEM.publishedAt,
          status: 'PENDING',
          primaryCategory: null,
        },
      ],
      25
    )
    expect(summary).toEqual({ checked: 1, created: 0, attached: 1, flagged: 0, skipped: 0 })
    expect(matchDecisionRepo.recordMatchDecisionSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        callSite: 'ingestion',
        candidateStoryId: 'story-x',
        thresholdMatched: true,
        llmVerdict: null,
        decidedBy: 'THRESHOLD',
      })
    )
  })

  it('skips attaching (without failing the pass) when the matched Analysis is already at MAX_COVERAGES_PER_ANALYSIS', async () => {
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
    vi.mocked(coverageRepo.addCoveragesIfWithinLimit).mockResolvedValue({ ok: false, activeCount: 25 })

    const summary = await runIngestionPass()

    expect(summary).toEqual({ checked: 1, created: 0, attached: 0, flagged: 0, skipped: 1 })
  })

  it('skips attaching when this Source already has non-excluded Coverage on the matched Analysis (P0-6, docs/audit.md)', async () => {
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
    vi.mocked(coverageRepo.findCoveragesForAnalysis).mockResolvedValue([
      makeCoverage('already-there', 'Earlier article from the same outlet'),
    ])

    const summary = await runIngestionPass()

    expect(coverageRepo.createCoverages).not.toHaveBeenCalled()
    expect(summary).toEqual({ checked: 1, created: 0, attached: 0, flagged: 0, skipped: 1 })
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
      sourceId: RSS_ITEM.sourceId,
      title: RSS_ITEM.title,
      articleUrl: RSS_ITEM.url,
      publishedAt: RSS_ITEM.publishedAt,
      primaryCategory: null,
    })
    expect(summary).toEqual({ checked: 1, created: 0, attached: 0, flagged: 1, skipped: 0 })
  })

  it("resolves primaryCategory from the flagged item's source and raw categories, since it won't be re-derivable once the PendingAddition sits in the review queue", async () => {
    stubCommon()
    const categorizedItem = { ...RSS_ITEM, sourceId: 'src-novinky', rawCategories: ['Domácí'] }
    vi.mocked(rssModule.queryRssFeeds).mockResolvedValue([categorizedItem])
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

    await runIngestionPass()

    expect(pendingAdditionRepo.createPendingAddition).toHaveBeenCalledWith(
      expect.objectContaining({ primaryCategory: 'DOMESTIC' })
    )
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

  it('excludes a candidate outside DEDUP_WINDOW_HOURS from matching, even with perfect similarity', async () => {
    // A candidate with a perfect similarity score (identical embedding) but from weeks ago must
    // still fail to match — otherwise "Trump announced new tariffs" three weeks apart would keep
    // re-attaching to the same stale Story forever. The hard window filter in
    // storyMatching.ts's scoreBestCandidate does this now (ADR 0025) — previously a
    // multiplicative time-decay factor did, which P1-7/docs/audit.md found shrank the
    // *effective* window well below the declared 48h even for in-window candidates.
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
      sourceId: 'src-novinky',
      outlet: 'Novinky',
      title: 'Second',
      url: 'https://novinky.cz/second',
      publishedAt: '2026-01-01T00:00:00Z',
    }
    vi.mocked(rssModule.queryRssFeeds).mockResolvedValue([RSS_ITEM, secondItem])
    vi.mocked(embeddingClientModule.generateEmbedding)
      .mockRejectedValueOnce(new Error('embeddings API down'))
      .mockResolvedValueOnce(ITEM_EMBEDDING_RESULT)
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
  story: {
    id: 's1',
    createdAt: new Date(),
    eventTime: new Date(),
    anchorHeadline: 'Anchor headline',
    embedding: [],
    embeddingModel: null,
    embeddingInputHash: null,
  },
}

function makeCoverage(id: string, title: string, outlet = 'iDnes') {
  return {
    id,
    analysisId: 'a1',
    sourceId: 'src-idnes',
    source: { name: outlet },
    title,
    articleUrl: `https://idnes.cz/${id}`,
    publishedAt: '2026-01-01T00:00:00Z',
    extractedText: null,
    extractionResult: null,
    status: 'PENDING' as const,
    excluded: false,
    primaryCategory: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  }
}

function makeTitlelessCoverage(id: string, outlet = 'iDnes') {
  return { ...makeCoverage(id, '', outlet), title: null }
}

describe('approveDraft', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Matches the real repo's contract: onTransition runs (with the transactional client) only
    // when the transition actually happens — see repositories/analysis.ts.
    vi.mocked(analysisRepo.updateAnalysisStatusIfCurrently).mockImplementation(
      async (_id, _from, _to, onTransition) => {
        await onTransition?.({} as never)
        return true
      }
    )
    vi.mocked(jobsEnqueue.enqueueJob).mockResolvedValue('job-1')
  })

  it('flips a Draft to PENDING and excludes nothing when every Coverage verifies', async () => {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue(DRAFT_WITH_STORY)
    const coverages = [makeCoverage('c1', 'T1'), makeCoverage('c2', 'T2')]
    vi.mocked(coverageRepo.findCoveragesForAnalysis).mockResolvedValue(coverages)
    vi.mocked(storyVerificationModule.verifyCandidatesAgainstAnchorInBatches).mockResolvedValue(coverages)

    const result = await approveDraft('a1', ACTOR_ID)

    expect(result).toEqual({ excluded: [] })
    expect(storyVerificationModule.verifyCandidatesAgainstAnchorInBatches).toHaveBeenCalledWith(
      coverages,
      'Anchor headline',
      undefined
    )
    expect(coverageRepo.excludeCoverageIds).not.toHaveBeenCalled()
    expect(analysisRepo.updateAnalysisStatusIfCurrently).toHaveBeenCalledWith(
      'a1',
      'DRAFT',
      'PENDING',
      expect.any(Function)
    )
    expect(adminActionLogRepo.recordAdminActionSafe).toHaveBeenCalledWith({
      actorId: ACTOR_ID,
      action: 'draft.approved',
      targetType: 'analysis',
      targetId: 'a1',
    })
  })

  it('excludes only the specific Coverage that fails verification and proceeds to PENDING with the remainder', async () => {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue(DRAFT_WITH_STORY)
    const good = makeCoverage('c1', 'Related to the anchor')
    const bad = makeCoverage('c2', 'Unrelated trending item')
    vi.mocked(coverageRepo.findCoveragesForAnalysis).mockResolvedValue([good, bad])
    vi.mocked(storyVerificationModule.verifyCandidatesAgainstAnchorInBatches).mockResolvedValue([good])

    await approveDraft('a1', ACTOR_ID)

    expect(coverageRepo.excludeCoverageIds).toHaveBeenCalledWith(['c2'])
    expect(analysisRepo.updateAnalysisStatusIfCurrently).toHaveBeenCalledWith(
      'a1',
      'DRAFT',
      'PENDING',
      expect.any(Function)
    )
  })

  it('still proceeds to PENDING when every Coverage fails verification, without throwing', async () => {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue(DRAFT_WITH_STORY)
    const coverages = [makeCoverage('c1', 'Unrelated'), makeCoverage('c2', 'Also unrelated')]
    vi.mocked(coverageRepo.findCoveragesForAnalysis).mockResolvedValue(coverages)
    vi.mocked(storyVerificationModule.verifyCandidatesAgainstAnchorInBatches).mockResolvedValue([])

    await approveDraft('a1', ACTOR_ID)

    expect(coverageRepo.excludeCoverageIds).toHaveBeenCalledWith(['c1', 'c2'])
    expect(analysisRepo.updateAnalysisStatusIfCurrently).toHaveBeenCalledWith(
      'a1',
      'DRAFT',
      'PENDING',
      expect.any(Function)
    )
  })

  it('never sends a title-less Coverage to verification, treating it as unverifiable', async () => {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue(DRAFT_WITH_STORY)
    const titled = makeCoverage('c1', 'T1')
    const titleless = makeTitlelessCoverage('c2')
    vi.mocked(coverageRepo.findCoveragesForAnalysis).mockResolvedValue([titled, titleless])
    vi.mocked(storyVerificationModule.verifyCandidatesAgainstAnchorInBatches).mockResolvedValue([titled])

    await approveDraft('a1', ACTOR_ID)

    expect(storyVerificationModule.verifyCandidatesAgainstAnchorInBatches).toHaveBeenCalledWith(
      [titled],
      'Anchor headline',
      undefined
    )
    expect(coverageRepo.excludeCoverageIds).toHaveBeenCalledWith(['c2'])
  })

  it('logs a title-less exclusion distinctly from a failed-verification one, not as one misleading bucket (P1-12)', async () => {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue(DRAFT_WITH_STORY)
    const rejected = makeCoverage('c1', 'Unrelated trending item')
    const titleless = makeTitlelessCoverage('c2')
    vi.mocked(coverageRepo.findCoveragesForAnalysis).mockResolvedValue([rejected, titleless])
    vi.mocked(storyVerificationModule.verifyCandidatesAgainstAnchorInBatches).mockResolvedValue([])
    const log = { warn: vi.fn(), error: vi.fn() } as unknown as FastifyBaseLogger

    await approveDraft('a1', ACTOR_ID, log)

    expect(coverageRepo.excludeCoverageIds).toHaveBeenCalledWith(['c1', 'c2'])
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ excludedCount: 1 }),
      expect.stringContaining('failed or errored during same-story verification')
    )
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ excludedCount: 1 }),
      expect.stringContaining('never sent to verification')
    )
    expect(log.warn).toHaveBeenCalledTimes(2)
  })

  it('returns a failed-verification exclusion summary naming the dropped outlet (ticket 87)', async () => {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue(DRAFT_WITH_STORY)
    const good = makeCoverage('c1', 'Related to the anchor', 'ČT24')
    const bad = makeCoverage('c2', 'Unrelated trending item', 'Blesk')
    vi.mocked(coverageRepo.findCoveragesForAnalysis).mockResolvedValue([good, bad])
    vi.mocked(storyVerificationModule.verifyCandidatesAgainstAnchorInBatches).mockResolvedValue([good])

    const result = await approveDraft('a1', ACTOR_ID)

    expect(result).toEqual({
      excluded: [{ coverageId: 'c2', outlet: 'Blesk', reason: 'failed-verification' }],
    })
  })

  it('returns a no-title exclusion distinctly from a failed one, each with its outlet (ticket 87)', async () => {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue(DRAFT_WITH_STORY)
    const rejected = makeCoverage('c1', 'Unrelated trending item', 'Blesk')
    const titleless = makeTitlelessCoverage('c2', 'Seznam Zprávy')
    vi.mocked(coverageRepo.findCoveragesForAnalysis).mockResolvedValue([rejected, titleless])
    vi.mocked(storyVerificationModule.verifyCandidatesAgainstAnchorInBatches).mockResolvedValue([])

    const result = await approveDraft('a1', ACTOR_ID)

    expect(result).toEqual({
      excluded: [
        { coverageId: 'c1', outlet: 'Blesk', reason: 'failed-verification' },
        { coverageId: 'c2', outlet: 'Seznam Zprávy', reason: 'no-title' },
      ],
    })
  })

  it('still returns the exclusion summary when the Draft was concurrently rejected (ticket 87)', async () => {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue(DRAFT_WITH_STORY)
    const bad = makeCoverage('c1', 'Unrelated', 'Blesk')
    vi.mocked(coverageRepo.findCoveragesForAnalysis).mockResolvedValue([bad])
    vi.mocked(storyVerificationModule.verifyCandidatesAgainstAnchorInBatches).mockResolvedValue([])
    vi.mocked(analysisRepo.updateAnalysisStatusIfCurrently).mockResolvedValue(false)

    const result = await approveDraft('a1', ACTOR_ID)

    expect(result).toEqual({
      excluded: [{ coverageId: 'c1', outlet: 'Blesk', reason: 'failed-verification' }],
    })
  })

  it('does not resurrect a Draft that was concurrently rejected while verification was in flight', async () => {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue(DRAFT_WITH_STORY)
    const coverages = [makeCoverage('c1', 'T1')]
    vi.mocked(coverageRepo.findCoveragesForAnalysis).mockResolvedValue(coverages)
    vi.mocked(storyVerificationModule.verifyCandidatesAgainstAnchorInBatches).mockResolvedValue(coverages)
    vi.mocked(analysisRepo.updateAnalysisStatusIfCurrently).mockResolvedValue(false)

    await expect(approveDraft('a1', ACTOR_ID)).resolves.toEqual({ excluded: [] })

    expect(analysisRepo.updateAnalysisStatusIfCurrently).toHaveBeenCalledWith(
      'a1',
      'DRAFT',
      'PENDING',
      expect.any(Function)
    )
    expect(adminActionLogRepo.recordAdminActionSafe).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when the Analysis does not exist', async () => {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue(null)

    await expect(approveDraft('missing', ACTOR_ID)).rejects.toThrow(NotFoundError)
  })

  it('throws ValidationError when the Analysis is not a Draft', async () => {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue({
      ...DRAFT_WITH_STORY,
      status: 'COMPLETE',
    })

    await expect(approveDraft('a1', ACTOR_ID)).rejects.toThrow(ValidationError)
  })

  it('enqueues the entity.extract job with this Analysis id and the draft-approval origin', async () => {
    vi.mocked(analysisRepo.findAnalysisWithStory).mockResolvedValue(DRAFT_WITH_STORY)
    const good = makeCoverage('c1', 'Related to the anchor')
    const bad = makeCoverage('c2', 'Unrelated trending item')
    vi.mocked(coverageRepo.findCoveragesForAnalysis).mockResolvedValue([good, bad])
    vi.mocked(storyVerificationModule.verifyCandidatesAgainstAnchorInBatches).mockResolvedValue([good])

    await approveDraft('a1', ACTOR_ID)

    expect(jobsEnqueue.enqueueJob).toHaveBeenCalledWith(
      JobName.EntityRelation,
      { analysisId: 'a1', origin: 'draft-approval', coverageIds: ['c1'] },
      expect.any(Object)
    )
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

    await rejectDraft('a1', ACTOR_ID)

    expect(analysisRepo.updateAnalysisStatus).toHaveBeenCalledWith('a1', 'FAILED')
    expect(adminActionLogRepo.recordAdminActionSafe).toHaveBeenCalledWith({
      actorId: ACTOR_ID,
      action: 'draft.rejected',
      targetType: 'analysis',
      targetId: 'a1',
    })
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

    await expect(rejectDraft('a1', ACTOR_ID)).rejects.toThrow(ValidationError)
  })
})

describe('listPendingAdditions', () => {
  beforeEach(() => vi.resetAllMocks())

  it('maps repository rows to PendingAdditionItems', async () => {
    vi.mocked(pendingAdditionRepo.findPendingAdditionsPage).mockResolvedValue([
      {
        id: 'p1',
        analysisId: 'a1',
        sourceId: 'src-idnes',
        title: 'T',
        articleUrl: 'https://idnes.cz/x',
        publishedAt: '2026-01-01T00:00:00Z',
        status: 'PENDING_REVIEW',
        primaryCategory: null,
        createdAt: new Date('2026-01-02T00:00:00Z'),
        analysis: { seedHeadline: 'Original story' },
        source: { name: 'iDnes' },
      },
    ])

    const result = await listPendingAdditions(undefined)

    expect(pendingAdditionRepo.findPendingAdditionsPage).toHaveBeenCalledWith(undefined, 20)
    expect(result.items).toEqual([
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
    expect(result.nextCursor).toBeNull()
  })

  it('returns a nextCursor when the repository returns one more row than the page limit', async () => {
    vi.mocked(pendingAdditionRepo.findPendingAdditionsPage).mockResolvedValue([
      {
        id: 'p1',
        analysisId: 'a1',
        sourceId: 'src-idnes',
        title: 'A',
        articleUrl: 'https://idnes.cz/a',
        publishedAt: '2026-01-02T00:00:00Z',
        status: 'PENDING_REVIEW',
        primaryCategory: null,
        createdAt: new Date('2026-01-02T00:00:00Z'),
        analysis: { seedHeadline: 'Story A' },
        source: { name: 'iDnes' },
      },
      {
        id: 'p2',
        analysisId: 'a2',
        sourceId: 'src-novinky',
        title: 'B',
        articleUrl: 'https://novinky.cz/b',
        publishedAt: '2026-01-01T00:00:00Z',
        status: 'PENDING_REVIEW',
        primaryCategory: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        analysis: { seedHeadline: 'Story B' },
        source: { name: 'Novinky' },
      },
    ])

    const result = await listPendingAdditions(undefined, 1)

    expect(result.items).toHaveLength(1)
    expect(result.nextCursor).not.toBeNull()
  })

  it('returns an empty page when nothing is pending', async () => {
    vi.mocked(pendingAdditionRepo.findPendingAdditionsPage).mockResolvedValue([])

    expect(await listPendingAdditions(undefined)).toEqual({ items: [], nextCursor: null })
  })
})

describe('approvePendingAddition', () => {
  const PENDING_ADDITION = {
    id: 'p1',
    analysisId: 'a1',
    sourceId: 'src-idnes',
    title: 'New coverage',
    articleUrl: 'https://idnes.cz/new-article',
    publishedAt: '2026-01-01T00:00:00Z',
    status: 'PENDING_REVIEW' as const,
    primaryCategory: null,
    createdAt: new Date('2026-01-02T00:00:00Z'),
    analysis: { status: 'COMPLETE' as const },
  }

  const ATTACHED_COVERAGE = makeCoverage('new-cov', 'New coverage')

  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(pendingAdditionRepo.findPendingAdditionById).mockResolvedValue(PENDING_ADDITION)
    vi.mocked(coverageRepo.addCoveragesIfWithinLimit).mockResolvedValue({ ok: true })
    // First call is the pre-attach duplicate-source check (no existing Coverage for this Source
    // yet); second is the post-attach lookup that finds the newly-created row.
    vi.mocked(coverageRepo.findCoveragesForAnalysis)
      .mockResolvedValueOnce([])
      .mockResolvedValue([ATTACHED_COVERAGE])
    vi.mocked(articleScraperModule.scrapeForCoverage).mockResolvedValue({
      status: 'OK',
      extractedText: 'A'.repeat(200),
    })
    vi.mocked(analysisRepo.updateAnalysisStatusIfCurrently).mockImplementation(
      async (_id, _from, _to, onTransition) => {
        await onTransition?.({} as never)
        return true
      }
    )
    vi.mocked(pendingAdditionRepo.updatePendingAdditionStatusIfCurrently).mockResolvedValue(true)
    vi.mocked(jobsEnqueue.enqueueJob).mockResolvedValue('job-1')
  })

  it('attaches the Coverage, scrapes it, clears the stale synthesis, and re-triangulates', async () => {
    await approvePendingAddition('p1', ACTOR_ID)

    expect(coverageRepo.addCoveragesIfWithinLimit).toHaveBeenCalledWith(
      'a1',
      [
        {
          analysisId: 'a1',
          sourceId: 'src-idnes',
          title: 'New coverage',
          articleUrl: 'https://idnes.cz/new-article',
          publishedAt: '2026-01-01T00:00:00Z',
          status: 'PENDING',
          primaryCategory: null,
        },
      ],
      expect.any(Number)
    )
    expect(coverageRepo.updateCoverage).toHaveBeenCalledWith('new-cov', {
      extractedText: 'A'.repeat(200),
      status: 'OK',
    })
    expect(synthesisResultRepo.deleteSynthesisResult).toHaveBeenCalledWith('a1', expect.any(Object))
    expect(analysisRepo.updateAnalysisStatusIfCurrently).toHaveBeenCalledWith(
      'a1',
      'COMPLETE',
      'PENDING',
      expect.any(Function)
    )
    expect(jobsEnqueue.enqueueJob).toHaveBeenCalledWith(
      JobName.EntityRelation,
      { analysisId: 'a1', origin: 'pending-addition-approval', coverageIds: ['new-cov'] },
      expect.any(Object)
    )
    expect(pendingAdditionRepo.updatePendingAdditionStatusIfCurrently).toHaveBeenCalledWith(
      'p1',
      'PENDING_REVIEW',
      'APPROVED'
    )
    expect(adminActionLogRepo.recordAdminActionSafe).toHaveBeenCalledWith({
      actorId: ACTOR_ID,
      action: 'pending_addition.approved',
      targetType: 'pending_addition',
      targetId: 'p1',
    })
  })

  it("copies the PendingAddition's own primaryCategory onto the Coverage it creates, verbatim", async () => {
    vi.mocked(pendingAdditionRepo.findPendingAdditionById).mockResolvedValue({
      ...PENDING_ADDITION,
      primaryCategory: 'DOMESTIC',
    })

    await approvePendingAddition('p1', ACTOR_ID)

    expect(coverageRepo.addCoveragesIfWithinLimit).toHaveBeenCalledWith(
      'a1',
      [expect.objectContaining({ primaryCategory: 'DOMESTIC' })],
      expect.any(Number)
    )
  })

  it('marks the Coverage EXTRACTION_FAILED and enqueues no coverageIds when scraping is unsuccessful', async () => {
    vi.mocked(articleScraperModule.scrapeForCoverage).mockResolvedValue({ status: 'EXTRACTION_FAILED' })

    await approvePendingAddition('p1', ACTOR_ID)

    expect(coverageRepo.updateCoverage).toHaveBeenCalledWith('new-cov', { status: 'EXTRACTION_FAILED' })
    expect(jobsEnqueue.enqueueJob).toHaveBeenCalledWith(
      JobName.EntityRelation,
      { analysisId: 'a1', origin: 'pending-addition-approval', coverageIds: [] },
      expect.any(Object)
    )
  })

  it('throws NotFoundError when the Pending Addition does not exist', async () => {
    vi.mocked(pendingAdditionRepo.findPendingAdditionById).mockResolvedValue(null)

    await expect(approvePendingAddition('missing', ACTOR_ID)).rejects.toThrow(NotFoundError)
  })

  it('throws ValidationError when the Pending Addition is not PENDING_REVIEW', async () => {
    vi.mocked(pendingAdditionRepo.findPendingAdditionById).mockResolvedValue({
      ...PENDING_ADDITION,
      status: 'APPROVED',
    })

    await expect(approvePendingAddition('p1', ACTOR_ID)).rejects.toThrow(ValidationError)
    expect(coverageRepo.addCoveragesIfWithinLimit).not.toHaveBeenCalled()
  })

  it('throws ValidationError when the Analysis is no longer COMPLETE', async () => {
    vi.mocked(pendingAdditionRepo.findPendingAdditionById).mockResolvedValue({
      ...PENDING_ADDITION,
      analysis: { status: 'PENDING' },
    })

    await expect(approvePendingAddition('p1', ACTOR_ID)).rejects.toThrow(ValidationError)
    expect(coverageRepo.addCoveragesIfWithinLimit).not.toHaveBeenCalled()
  })

  it('throws ValidationError when the Analysis is already at the Coverage cap', async () => {
    vi.mocked(coverageRepo.addCoveragesIfWithinLimit).mockResolvedValue({ ok: false, activeCount: 25 })

    await expect(approvePendingAddition('p1', ACTOR_ID)).rejects.toThrow(ValidationError)
    expect(articleScraperModule.scrapeForCoverage).not.toHaveBeenCalled()
    expect(pendingAdditionRepo.updatePendingAdditionStatusIfCurrently).not.toHaveBeenCalled()
  })

  it('resolves a duplicate Pending Addition for an already-attached Source (same URL) without re-scraping or re-triangulating', async () => {
    vi.mocked(coverageRepo.findCoveragesForAnalysis)
      .mockReset()
      .mockResolvedValue([{ ...ATTACHED_COVERAGE, articleUrl: PENDING_ADDITION.articleUrl }])
    vi.mocked(pendingAdditionRepo.updatePendingAdditionStatusIfCurrently).mockResolvedValue(true)

    await approvePendingAddition('p1', ACTOR_ID)

    expect(coverageRepo.addCoveragesIfWithinLimit).not.toHaveBeenCalled()
    expect(articleScraperModule.scrapeForCoverage).not.toHaveBeenCalled()
    expect(synthesisResultRepo.deleteSynthesisResult).not.toHaveBeenCalled()
    expect(analysisRepo.updateAnalysisStatusIfCurrently).not.toHaveBeenCalled()
    expect(pendingAdditionRepo.updatePendingAdditionStatusIfCurrently).toHaveBeenCalledWith(
      'p1',
      'PENDING_REVIEW',
      'APPROVED'
    )
    expect(adminActionLogRepo.recordAdminActionSafe).toHaveBeenCalledWith({
      actorId: ACTOR_ID,
      action: 'pending_addition.approved',
      targetType: 'pending_addition',
      targetId: 'p1',
    })
  })

  it('throws a distinct ValidationError (not the cap message) when the Source is already attached via a different article', async () => {
    vi.mocked(coverageRepo.findCoveragesForAnalysis)
      .mockReset()
      .mockResolvedValue([{ ...ATTACHED_COVERAGE, articleUrl: 'https://idnes.cz/a-different-article' }])

    await expect(approvePendingAddition('p1', ACTOR_ID)).rejects.toThrow(
      'Tento zdroj je již k analýze připojen jiným článkem'
    )
    expect(coverageRepo.addCoveragesIfWithinLimit).not.toHaveBeenCalled()
    expect(pendingAdditionRepo.updatePendingAdditionStatusIfCurrently).not.toHaveBeenCalled()
  })

  it('throws ValidationError instead of crashing when the newly attached Coverage cannot be found afterward', async () => {
    vi.mocked(coverageRepo.findCoveragesForAnalysis)
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValue([])

    await expect(approvePendingAddition('p1', ACTOR_ID)).rejects.toThrow(ValidationError)
    expect(articleScraperModule.scrapeForCoverage).not.toHaveBeenCalled()
  })

  it('throws ValidationError when the Analysis status changed concurrently during re-triangulation setup', async () => {
    vi.mocked(analysisRepo.updateAnalysisStatusIfCurrently).mockResolvedValue(false)

    await expect(approvePendingAddition('p1', ACTOR_ID)).rejects.toThrow(ValidationError)
    expect(pendingAdditionRepo.updatePendingAdditionStatusIfCurrently).not.toHaveBeenCalled()
  })

  it('does not throw when the final Pending Addition status write loses a race — the re-triangulation already succeeded', async () => {
    vi.mocked(pendingAdditionRepo.updatePendingAdditionStatusIfCurrently).mockResolvedValue(false)

    await expect(approvePendingAddition('p1', ACTOR_ID)).resolves.toBeUndefined()

    expect(adminActionLogRepo.recordAdminActionSafe).toHaveBeenCalledWith({
      actorId: ACTOR_ID,
      action: 'pending_addition.approved',
      targetType: 'pending_addition',
      targetId: 'p1',
    })
  })
})

describe('rejectPendingAddition', () => {
  beforeEach(() => vi.resetAllMocks())

  const PENDING_ADDITION = {
    id: 'p1',
    analysisId: 'a1',
    sourceId: 'src-idnes',
    title: 'New coverage',
    articleUrl: 'https://idnes.cz/new-article',
    publishedAt: '2026-01-01T00:00:00Z',
    status: 'PENDING_REVIEW' as const,
    primaryCategory: null,
    createdAt: new Date('2026-01-02T00:00:00Z'),
    analysis: { status: 'COMPLETE' as const },
  }

  it('transitions a Pending Addition to REJECTED, permanently', async () => {
    vi.mocked(pendingAdditionRepo.findPendingAdditionById).mockResolvedValue(PENDING_ADDITION)
    vi.mocked(pendingAdditionRepo.updatePendingAdditionStatusIfCurrently).mockResolvedValue(true)

    await rejectPendingAddition('p1', ACTOR_ID)

    expect(pendingAdditionRepo.updatePendingAdditionStatusIfCurrently).toHaveBeenCalledWith(
      'p1',
      'PENDING_REVIEW',
      'REJECTED'
    )
    expect(adminActionLogRepo.recordAdminActionSafe).toHaveBeenCalledWith({
      actorId: ACTOR_ID,
      action: 'pending_addition.rejected',
      targetType: 'pending_addition',
      targetId: 'p1',
    })
  })

  it('throws NotFoundError when the Pending Addition does not exist', async () => {
    vi.mocked(pendingAdditionRepo.findPendingAdditionById).mockResolvedValue(null)

    await expect(rejectPendingAddition('missing', ACTOR_ID)).rejects.toThrow(NotFoundError)
  })

  it('throws ValidationError when the Pending Addition is not PENDING_REVIEW', async () => {
    vi.mocked(pendingAdditionRepo.findPendingAdditionById).mockResolvedValue({
      ...PENDING_ADDITION,
      status: 'REJECTED',
    })

    await expect(rejectPendingAddition('p1', ACTOR_ID)).rejects.toThrow(ValidationError)
    expect(pendingAdditionRepo.updatePendingAdditionStatusIfCurrently).not.toHaveBeenCalled()
  })

  it('throws ValidationError when the status changed concurrently between the check and the write', async () => {
    vi.mocked(pendingAdditionRepo.findPendingAdditionById).mockResolvedValue(PENDING_ADDITION)
    vi.mocked(pendingAdditionRepo.updatePendingAdditionStatusIfCurrently).mockResolvedValue(false)

    await expect(rejectPendingAddition('p1', ACTOR_ID)).rejects.toThrow(ValidationError)
  })
})

describe('listVisibleDrafts', () => {
  beforeEach(() => vi.resetAllMocks())

  // The visibility threshold (MIN_VISIBLE_SOURCE_COUNT) is now applied inside the repository's
  // own HAVING clause (ticket 03) — findDraftsPage is trusted to have already filtered these
  // rows, so these tests exercise the mapping/pagination logic, not the threshold itself
  // (that's covered by the integration test against real Postgres).

  it('maps each repository row to an AnalysisListItem with status "draft"', async () => {
    vi.mocked(analysisRepo.findDraftsPage).mockResolvedValue([
      {
        id: 'd1',
        seedHeadline: 'Corroborated draft',
        headline: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        coverageCount: 2,
      },
    ])

    const result = await listVisibleDrafts(undefined)

    expect(analysisRepo.findDraftsPage).toHaveBeenCalledWith(2, undefined, 20)
    expect(result.items).toEqual([
      {
        id: 'd1',
        seedHeadline: 'Corroborated draft',
        title: 'Corroborated draft',
        createdAt: '2026-01-01T00:00:00.000Z',
        coverageCount: 2,
        status: 'draft',
      },
    ])
    expect(result.nextCursor).toBeNull()
  })

  it('returns a nextCursor when the repository returns one more row than the page limit', async () => {
    vi.mocked(analysisRepo.findDraftsPage).mockResolvedValue([
      {
        id: 'd1',
        seedHeadline: 'A',
        headline: null,
        createdAt: new Date('2026-01-02T00:00:00Z'),
        coverageCount: 2,
      },
      {
        id: 'd2',
        seedHeadline: 'B',
        headline: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        coverageCount: 3,
      },
    ])

    const result = await listVisibleDrafts(undefined, 1)

    expect(result.items).toHaveLength(1)
    expect(result.nextCursor).not.toBeNull()
  })

  it('returns an empty page when nothing is visible', async () => {
    vi.mocked(analysisRepo.findDraftsPage).mockResolvedValue([])

    expect(await listVisibleDrafts(undefined)).toEqual({ items: [], nextCursor: null })
  })
})

describe('listPendingStoryRelations', () => {
  beforeEach(() => vi.resetAllMocks())

  it('maps repository rows to PendingStoryRelationItems, using the generated headline when present and falling back to the working title otherwise', async () => {
    vi.mocked(storyRelationRepo.findPendingReviewRelations).mockResolvedValue([
      {
        id: 'r1',
        fromAnalysisId: 'a-from',
        fromSeedHeadline: 'From working title',
        fromHeadline: 'From generated headline',
        toAnalysisId: 'a-to',
        toSeedHeadline: 'To working title',
        toHeadline: null,
        type: 'FOLLOW_UP',
        reasoning: 'A continues B.',
        createdAt: new Date('2026-01-02T00:00:00Z'),
      },
    ])

    const result = await listPendingStoryRelations()

    expect(result).toEqual([
      {
        id: 'r1',
        fromAnalysisId: 'a-from',
        fromTitle: 'From generated headline',
        toAnalysisId: 'a-to',
        toTitle: 'To working title',
        type: 'FOLLOW_UP',
        reasoning: 'A continues B.',
        createdAt: '2026-01-02T00:00:00.000Z',
      },
    ])
  })
})

describe('approveStoryRelation', () => {
  beforeEach(() => vi.resetAllMocks())

  const PENDING_RELATION = {
    id: 'r1',
    fromStoryId: 's-from',
    toStoryId: 's-to',
    type: 'FOLLOW_UP' as const,
    confidenceTier: 'LOW' as const,
    reasoning: 'x',
    status: 'PENDING_REVIEW' as const,
    createdAt: new Date(),
  }

  it('transitions a pending relation to PUBLISHED and enqueues thread.recompute (FOLLOW_UP)', async () => {
    vi.mocked(storyRelationRepo.findStoryRelationById).mockResolvedValue(PENDING_RELATION)
    vi.mocked(storyRelationRepo.updateStoryRelationStatusIfCurrently).mockResolvedValue(true)

    await approveStoryRelation('r1', ACTOR_ID)

    expect(storyRelationRepo.updateStoryRelationStatusIfCurrently).toHaveBeenCalledWith(
      'r1',
      'PENDING_REVIEW',
      'PUBLISHED'
    )
    expect(jobsEnqueue.enqueueJob).toHaveBeenCalledWith(JobName.ThreadRecompute, {
      seedStoryId: PENDING_RELATION.fromStoryId,
    })
    expect(adminActionLogRepo.recordAdminActionSafe).toHaveBeenCalledWith({
      actorId: ACTOR_ID,
      action: 'story_relation.approved',
      targetType: 'story_relation',
      targetId: 'r1',
    })
  })

  it('does not enqueue thread.recompute when the approved relation is RELATED, not FOLLOW_UP', async () => {
    vi.mocked(storyRelationRepo.findStoryRelationById).mockResolvedValue({
      ...PENDING_RELATION,
      type: 'RELATED',
    })
    vi.mocked(storyRelationRepo.updateStoryRelationStatusIfCurrently).mockResolvedValue(true)

    await approveStoryRelation('r1', ACTOR_ID)

    expect(jobsEnqueue.enqueueJob).not.toHaveBeenCalled()
  })

  it('does not throw when enqueueing thread.recompute fails — the approval itself already succeeded', async () => {
    vi.mocked(storyRelationRepo.findStoryRelationById).mockResolvedValue(PENDING_RELATION)
    vi.mocked(storyRelationRepo.updateStoryRelationStatusIfCurrently).mockResolvedValue(true)
    vi.mocked(jobsEnqueue.enqueueJob).mockRejectedValue(new Error('queue down'))

    await expect(approveStoryRelation('r1', ACTOR_ID)).resolves.toBeUndefined()
  })

  it('throws NotFoundError when the relation does not exist', async () => {
    vi.mocked(storyRelationRepo.findStoryRelationById).mockResolvedValue(null)

    await expect(approveStoryRelation('missing', ACTOR_ID)).rejects.toThrow(NotFoundError)
  })

  it('throws ValidationError when the relation is not PENDING_REVIEW', async () => {
    vi.mocked(storyRelationRepo.findStoryRelationById).mockResolvedValue({
      ...PENDING_RELATION,
      status: 'PUBLISHED',
    })

    await expect(approveStoryRelation('r1', ACTOR_ID)).rejects.toThrow(ValidationError)
    expect(storyRelationRepo.updateStoryRelationStatusIfCurrently).not.toHaveBeenCalled()
  })

  it('throws ValidationError when the status changed concurrently between the check and the write', async () => {
    vi.mocked(storyRelationRepo.findStoryRelationById).mockResolvedValue(PENDING_RELATION)
    vi.mocked(storyRelationRepo.updateStoryRelationStatusIfCurrently).mockResolvedValue(false)

    await expect(approveStoryRelation('r1', ACTOR_ID)).rejects.toThrow(ValidationError)
  })
})

describe('rejectStoryRelation', () => {
  beforeEach(() => vi.resetAllMocks())

  const PENDING_RELATION = {
    id: 'r1',
    fromStoryId: 's-from',
    toStoryId: 's-to',
    type: 'RELATED' as const,
    confidenceTier: 'LOW' as const,
    reasoning: 'x',
    status: 'PENDING_REVIEW' as const,
    createdAt: new Date(),
  }

  it('transitions a pending relation to REJECTED, permanently', async () => {
    vi.mocked(storyRelationRepo.findStoryRelationById).mockResolvedValue(PENDING_RELATION)
    vi.mocked(storyRelationRepo.updateStoryRelationStatusIfCurrently).mockResolvedValue(true)

    await rejectStoryRelation('r1', ACTOR_ID)

    expect(storyRelationRepo.updateStoryRelationStatusIfCurrently).toHaveBeenCalledWith(
      'r1',
      'PENDING_REVIEW',
      'REJECTED'
    )
    expect(adminActionLogRepo.recordAdminActionSafe).toHaveBeenCalledWith({
      actorId: ACTOR_ID,
      action: 'story_relation.rejected',
      targetType: 'story_relation',
      targetId: 'r1',
    })
  })

  it('throws NotFoundError when the relation does not exist', async () => {
    vi.mocked(storyRelationRepo.findStoryRelationById).mockResolvedValue(null)

    await expect(rejectStoryRelation('missing', ACTOR_ID)).rejects.toThrow(NotFoundError)
  })

  it('throws ValidationError when the relation is not PENDING_REVIEW', async () => {
    vi.mocked(storyRelationRepo.findStoryRelationById).mockResolvedValue({
      ...PENDING_RELATION,
      status: 'REJECTED',
    })

    await expect(rejectStoryRelation('r1', ACTOR_ID)).rejects.toThrow(ValidationError)
    expect(storyRelationRepo.updateStoryRelationStatusIfCurrently).not.toHaveBeenCalled()
  })

  it('throws ValidationError when the status changed concurrently between the check and the write', async () => {
    vi.mocked(storyRelationRepo.findStoryRelationById).mockResolvedValue(PENDING_RELATION)
    vi.mocked(storyRelationRepo.updateStoryRelationStatusIfCurrently).mockResolvedValue(false)

    await expect(rejectStoryRelation('r1', ACTOR_ID)).rejects.toThrow(ValidationError)
  })
})
