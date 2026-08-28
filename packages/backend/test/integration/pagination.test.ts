import { describe, it, expect, afterAll } from 'vitest'
import {
  createAnalysis,
  createDraftAnalysis,
  findAnalysesPage,
  findDraftsPage,
  setAnalysisCreatedAtForTesting,
  updateAnalysisStatus,
  disconnect,
} from '../../src/repositories/analysis.js'
import {
  createCoverages,
  findCoveragesForAnalysis,
  excludeCoverageIds,
} from '../../src/repositories/coverage.js'
import {
  createPendingAddition,
  findPendingAdditionsPage,
  setPendingAdditionCreatedAtForTesting,
} from '../../src/repositories/pendingAddition.js'
import {
  createStoryRelation,
  findPendingReviewRelationsPage,
  setStoryRelationCreatedAtForTesting,
} from '../../src/repositories/storyRelation.js'

const SOURCES = ['src-idnes', 'src-novinky', 'src-aktualne', 'src-ct24', 'src-seznamzpravy']

// Pagination order depends on createdAt, and the integration test DB is shared across every
// test in this run (other files' rows use a real now(), and other `it` blocks in this same file
// run against the same table). Two defenses: (1) every row in this file gets a strictly
// increasing, far-future timestamp from this single counter, so it's always newest and never
// ties with another row in this file; (2) assertions filter down to each test's own known ids
// rather than asserting exact page contents, since an unbounded (includeAllStatuses: true) query
// can otherwise also surface unrelated rows from earlier tests in this same file.
let nextTimestamp = new Date('2999-01-01T00:00:00Z').getTime()
function futureTimestamp(): Date {
  nextTimestamp += 1000
  return new Date(nextTimestamp)
}

describe('Pagination against a real Postgres instance', () => {
  afterAll(async () => {
    await disconnect()
  })

  describe('findAnalysesPage', () => {
    it('pages newest-first, resuming exactly where the previous page left off', async () => {
      const a = await createDraftAnalysis({ seedUrl: 'https://example.cz/page-a', seedHeadline: 'A' })
      const b = await createDraftAnalysis({ seedUrl: 'https://example.cz/page-b', seedHeadline: 'B' })
      const c = await createDraftAnalysis({ seedUrl: 'https://example.cz/page-c', seedHeadline: 'C' })
      await setAnalysisCreatedAtForTesting(a.id, futureTimestamp())
      await setAnalysisCreatedAtForTesting(b.id, futureTimestamp())
      await setAnalysisCreatedAtForTesting(c.id, futureTimestamp())
      await updateAnalysisStatus(a.id, 'COMPLETE')
      await updateAnalysisStatus(b.id, 'COMPLETE')
      await updateAnalysisStatus(c.id, 'COMPLETE')
      const ownIds = new Set([a.id, b.id, c.id])

      const firstPage = (await findAnalysesPage(true, undefined, 50)).filter((r) => ownIds.has(r.id))
      expect(firstPage.map((r) => r.id)).toEqual([c.id, b.id, a.id])

      const cursorRow = firstPage[1] // pretend the "real" page size was 2 — resume after b
      const secondPage = (
        await findAnalysesPage(true, { createdAt: cursorRow.createdAt, id: cursorRow.id }, 50)
      ).filter((r) => ownIds.has(r.id))
      expect(secondPage.map((r) => r.id)).toEqual([a.id])
    })

    it('excludes non-COMPLETE Analyses when includeAllStatuses is false', async () => {
      const draft = await createDraftAnalysis({ seedUrl: 'https://example.cz/page-draft', seedHeadline: 'D' })
      await setAnalysisCreatedAtForTesting(draft.id, futureTimestamp())

      const page = await findAnalysesPage(false, undefined, 50)

      expect(page.map((r) => r.id)).not.toContain(draft.id)
    })
  })

  describe('findDraftsPage', () => {
    // Each test isolates its own rows with a tight createdAt window (this file's rows all get
    // far-future, strictly-increasing timestamps), so `total` is deterministic despite the
    // shared integration DB.
    const draftsIn = (lo: Date, hi: Date, extra: Partial<Parameters<typeof findDraftsPage>[0]> = {}) =>
      findDraftsPage({
        minVisibleSourceCount: 2,
        offset: 0,
        limit: 50,
        createdAfter: lo,
        createdBefore: hi,
        ...extra,
      })

    const makeVisibleDraft = async (
      seedUrl: string,
      seedHeadline: string,
      sources: string[] = [SOURCES[0], SOURCES[1]]
    ) => {
      const draft = await createDraftAnalysis({ seedUrl, seedHeadline })
      await setAnalysisCreatedAtForTesting(draft.id, futureTimestamp())
      await createCoverages(
        sources.map((sourceId, i) => ({
          analysisId: draft.id,
          sourceId,
          articleUrl: `${seedUrl}/${i}`,
          status: 'PENDING' as const,
        }))
      )
      return draft
    }

    it('only returns Drafts whose non-excluded Coverage count meets the threshold', async () => {
      const below = await createDraftAnalysis({
        seedUrl: 'https://example.cz/draft-below',
        seedHeadline: 'Below',
      })
      const atThreshold = await createDraftAnalysis({
        seedUrl: 'https://example.cz/draft-at',
        seedHeadline: 'At threshold',
      })
      await setAnalysisCreatedAtForTesting(below.id, futureTimestamp())
      await setAnalysisCreatedAtForTesting(atThreshold.id, futureTimestamp())
      await createCoverages([
        {
          analysisId: below.id,
          sourceId: SOURCES[0],
          articleUrl: 'https://idnes.cz/below',
          status: 'PENDING',
        },
      ])
      await createCoverages([
        {
          analysisId: atThreshold.id,
          sourceId: SOURCES[0],
          articleUrl: 'https://idnes.cz/at-1',
          status: 'PENDING',
        },
        {
          analysisId: atThreshold.id,
          sourceId: SOURCES[1],
          articleUrl: 'https://novinky.cz/at-2',
          status: 'PENDING',
        },
      ])

      const { rows } = await findDraftsPage({ minVisibleSourceCount: 2, offset: 0, limit: 50 })
      const ids = rows.map((r) => r.id)

      expect(ids).toContain(atThreshold.id)
      expect(ids).not.toContain(below.id)
    })

    it('does not count excluded Coverage toward the visibility threshold', async () => {
      const draft = await createDraftAnalysis({
        seedUrl: 'https://example.cz/draft-excluded',
        seedHeadline: 'Excluded',
      })
      await setAnalysisCreatedAtForTesting(draft.id, futureTimestamp())
      await createCoverages([
        {
          analysisId: draft.id,
          sourceId: SOURCES[0],
          articleUrl: 'https://idnes.cz/excl-1',
          status: 'PENDING',
        },
        {
          analysisId: draft.id,
          sourceId: SOURCES[1],
          articleUrl: 'https://novinky.cz/excl-2',
          status: 'PENDING',
        },
      ])
      const [firstCoverage] = await findCoveragesForAnalysis(draft.id)
      await excludeCoverageIds([firstCoverage.id])

      const { rows } = await findDraftsPage({ minVisibleSourceCount: 2, offset: 0, limit: 50 })

      expect(rows.map((r) => r.id)).not.toContain(draft.id)
    })

    it('offset-pages newest-first with a total that reflects the whole filtered set', async () => {
      const lo = futureTimestamp()
      const x = await makeVisibleDraft('https://example.cz/draft-page-x', 'X')
      const y = await makeVisibleDraft('https://example.cz/draft-page-y', 'Y')
      const z = await makeVisibleDraft('https://example.cz/draft-page-z', 'Z')
      const hi = futureTimestamp()

      const firstPage = await draftsIn(lo, hi, { limit: 2 })
      expect(firstPage.total).toBe(3)
      expect(firstPage.rows.map((r) => r.id)).toEqual([z.id, y.id])

      const secondPage = await draftsIn(lo, hi, { limit: 2, offset: 2 })
      expect(secondPage.total).toBe(3)
      expect(secondPage.rows.map((r) => r.id)).toEqual([x.id])
    })

    it('sorts by coverageCount when asked, respecting the direction', async () => {
      const lo = futureTimestamp()
      const two = await makeVisibleDraft('https://example.cz/draft-cc-2', 'Two', [SOURCES[0], SOURCES[1]])
      const four = await makeVisibleDraft('https://example.cz/draft-cc-4', 'Four', [
        SOURCES[0],
        SOURCES[1],
        SOURCES[2],
        SOURCES[3],
      ])
      const hi = futureTimestamp()

      const asc = await draftsIn(lo, hi, { sort: 'coverageCount', dir: 'asc' })
      expect(asc.rows.map((r) => r.id)).toEqual([two.id, four.id])

      const desc = await draftsIn(lo, hi, { sort: 'coverageCount', dir: 'desc' })
      expect(desc.rows.map((r) => r.id)).toEqual([four.id, two.id])
    })

    it('filters to Drafts with an attached Coverage from a Source whose name matches the outlet substring (case-insensitive)', async () => {
      const lo = futureTimestamp()
      // src-novinky → "Novinky", src-aktualne → "Aktuálně", src-ct24 → "ČT24" (seeded in migration).
      const withNovinky = await makeVisibleDraft('https://example.cz/draft-outlet-a', 'A', [
        SOURCES[1],
        SOURCES[2],
      ])
      await makeVisibleDraft('https://example.cz/draft-outlet-b', 'B', [SOURCES[3], SOURCES[4]])
      const hi = futureTimestamp()

      expect((await draftsIn(lo, hi)).total).toBe(2)

      const filtered = await draftsIn(lo, hi, { outlet: 'novin' })
      expect(filtered.total).toBe(1)
      expect(filtered.rows.map((r) => r.id)).toEqual([withNovinky.id])

      expect((await draftsIn(lo, hi, { outlet: 'zzz-no-such-outlet' })).total).toBe(0)
    })

    it('filters by created-at window', async () => {
      const before = await makeVisibleDraft('https://example.cz/draft-window-before', 'Before')
      const mid = futureTimestamp()
      const after = await makeVisibleDraft('https://example.cz/draft-window-after', 'After')
      const end = futureTimestamp()

      const onlyAfter = await findDraftsPage({
        minVisibleSourceCount: 2,
        offset: 0,
        limit: 50,
        createdAfter: mid,
        createdBefore: end,
      })
      const ids = onlyAfter.rows.map((r) => r.id)
      expect(ids).toContain(after.id)
      expect(ids).not.toContain(before.id)
    })
  })

  describe('findPendingAdditionsPage', () => {
    const analysisPromise = createAnalysis({
      seedUrl: 'https://example.cz/pending-addition-page',
      seedHeadline: 'Anchor story',
    })

    const makePendingAddition = async (articleUrl: string, sourceId = SOURCES[0]) => {
      const analysis = await analysisPromise
      const addition = await createPendingAddition({ analysisId: analysis.id, sourceId, articleUrl })
      await setPendingAdditionCreatedAtForTesting(addition.id, futureTimestamp())
      return addition
    }

    it('offset-pages newest-first with a total over the filtered set', async () => {
      const lo = futureTimestamp()
      const x = await makePendingAddition('https://idnes.cz/pending-page-x')
      const y = await makePendingAddition('https://idnes.cz/pending-page-y')
      const hi = futureTimestamp()

      const firstPage = await findPendingAdditionsPage({
        offset: 0,
        limit: 1,
        createdAfter: lo,
        createdBefore: hi,
      })
      expect(firstPage.total).toBe(2)
      expect(firstPage.rows.map((r) => r.id)).toEqual([y.id])

      const secondPage = await findPendingAdditionsPage({
        offset: 1,
        limit: 1,
        createdAfter: lo,
        createdBefore: hi,
      })
      expect(secondPage.rows.map((r) => r.id)).toEqual([x.id])
    })

    it('honours ascending direction', async () => {
      const lo = futureTimestamp()
      const x = await makePendingAddition('https://idnes.cz/pending-asc-x')
      const y = await makePendingAddition('https://idnes.cz/pending-asc-y')
      const hi = futureTimestamp()

      const asc = await findPendingAdditionsPage({
        offset: 0,
        limit: 50,
        dir: 'asc',
        createdAfter: lo,
        createdBefore: hi,
      })
      expect(asc.rows.map((r) => r.id)).toEqual([x.id, y.id])
    })

    it('filters to additions whose Source name matches the outlet substring (case-insensitive)', async () => {
      const lo = futureTimestamp()
      const fromNovinky = await makePendingAddition('https://novinky.cz/pending-outlet', SOURCES[1])
      await makePendingAddition('https://idnes.cz/pending-outlet', SOURCES[0])
      const hi = futureTimestamp()

      const filtered = await findPendingAdditionsPage({
        offset: 0,
        limit: 50,
        outlet: 'novin',
        createdAfter: lo,
        createdBefore: hi,
      })
      expect(filtered.total).toBe(1)
      expect(filtered.rows.map((r) => r.id)).toEqual([fromNovinky.id])
    })
  })

  describe('findPendingReviewRelationsPage', () => {
    const makePendingRelation = async (reasoning: string) => {
      const from = await createDraftAnalysis({
        seedUrl: `https://example.cz/rel-from-${reasoning}`,
        seedHeadline: `From ${reasoning}`,
      })
      const to = await createDraftAnalysis({
        seedUrl: `https://example.cz/rel-to-${reasoning}`,
        seedHeadline: `To ${reasoning}`,
      })
      const relation = await createStoryRelation({
        fromStoryId: from.storyId,
        toStoryId: to.storyId,
        type: 'RELATED',
        confidenceTier: 'LOW',
        reasoning,
        status: 'PENDING_REVIEW',
      })
      await setStoryRelationCreatedAtForTesting(relation.id, futureTimestamp())
      return relation
    }

    it('offset-pages newest-first with a total over the filtered set', async () => {
      const lo = futureTimestamp()
      const a = await makePendingRelation('a')
      const b = await makePendingRelation('b')
      const hi = futureTimestamp()

      const firstPage = await findPendingReviewRelationsPage({
        offset: 0,
        limit: 1,
        createdAfter: lo,
        createdBefore: hi,
      })
      expect(firstPage.total).toBe(2)
      expect(firstPage.rows.map((r) => r.id)).toEqual([b.id])

      const secondPage = await findPendingReviewRelationsPage({
        offset: 1,
        limit: 1,
        createdAfter: lo,
        createdBefore: hi,
      })
      expect(secondPage.rows.map((r) => r.id)).toEqual([a.id])
    })
  })
})
