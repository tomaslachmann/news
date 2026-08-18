import { describe, it, expect, afterAll } from 'vitest'
import {
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

describe('Keyset pagination against a real Postgres instance', () => {
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

      const page = await findDraftsPage(2, undefined, 50)
      const ids = page.map((r) => r.id)

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

      const page = await findDraftsPage(2, undefined, 50)

      expect(page.map((r) => r.id)).not.toContain(draft.id)
    })

    it('pages newest-first among visible Drafts, resuming exactly where the previous page left off', async () => {
      const makeVisibleDraft = async (seedUrl: string, seedHeadline: string) => {
        const draft = await createDraftAnalysis({ seedUrl, seedHeadline })
        await setAnalysisCreatedAtForTesting(draft.id, futureTimestamp())
        await createCoverages([
          { analysisId: draft.id, sourceId: SOURCES[0], articleUrl: `${seedUrl}/1`, status: 'PENDING' },
          { analysisId: draft.id, sourceId: SOURCES[1], articleUrl: `${seedUrl}/2`, status: 'PENDING' },
        ])
        return draft
      }

      const x = await makeVisibleDraft('https://example.cz/draft-page-x', 'X')
      const y = await makeVisibleDraft('https://example.cz/draft-page-y', 'Y')
      const ownIds = new Set([x.id, y.id])

      const firstPage = (await findDraftsPage(2, undefined, 50)).filter((r) => ownIds.has(r.id))
      expect(firstPage.map((r) => r.id)).toEqual([y.id, x.id])

      const cursorRow = firstPage[0]
      const secondPage = (
        await findDraftsPage(2, { createdAt: cursorRow.createdAt, id: cursorRow.id }, 50)
      ).filter((r) => ownIds.has(r.id))
      expect(secondPage.map((r) => r.id)).toEqual([x.id])
    })
  })
})
