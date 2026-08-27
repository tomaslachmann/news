import { describe, it, expect, afterAll } from 'vitest'
import type { NarrativeDocument } from '@news-triangulator/shared'
import { createAnalysis, completeAnalysisWithSynthesis, disconnect } from '../../src/repositories/analysis.js'
import { updateSynthesisResultNarrative } from '../../src/repositories/synthesisResult.js'
import { upsertThreadFromComponent } from '../../src/repositories/thread.js'
import {
  findVisibleMembersForClaimTracking,
  findProcessedAnalysisIdsForThread,
  findLatestSeriesMembersForThread,
  addClaimSeriesMember,
} from '../../src/repositories/claimSeries.js'

const DIMENSIONS = { agreement: [], contradiction: [], uniqueReporting: [], framing: [] }

function narrativeWithValue(text: string, normalizedValue: number, unit: string | null): NarrativeDocument {
  return {
    version: 1,
    blocks: [],
    assertions: [
      {
        id: 'a1',
        dimension: 'agreement',
        dimensionItemId: 'd1',
        entityRefs: ['e1'],
        sourceRefs: [],
        valueRefs: ['v1'],
      },
    ],
    entityRefs: [{ id: 'e1', entityKey: 'org:ministerstvo-financi', canonicalName: 'MF', imageUrl: null }],
    sourceRefs: [],
    valueRefs: [{ id: 'v1', text, sourceIds: ['s1'], normalizedValue, unit }],
  }
}

async function makeCompleteThreadMember(seedUrl: string, headline: string) {
  const analysis = await createAnalysis({ seedUrl, seedHeadline: headline })
  await completeAnalysisWithSynthesis(analysis.id, DIMENSIONS, {
    headline,
    sourceOverlapPercentage: null,
    agreementCategory: 'PARTIAL',
    searchText: 'test',
  })
  return analysis
}

describe('claimSeries repository against a real Postgres instance', () => {
  afterAll(async () => {
    await disconnect()
  })

  describe('findVisibleMembersForClaimTracking', () => {
    it('returns null for an unknown threadId', async () => {
      expect(await findVisibleMembersForClaimTracking('unknown-thread-id')).toBeNull()
    })

    it("returns each visible member's own Narrative document, null when not yet generated", async () => {
      const a = await makeCompleteThreadMember('https://example.cz/cs-a', 'A')
      const b = await makeCompleteThreadMember('https://example.cz/cs-b', 'B')
      const narrative = narrativeWithValue('18 miliard Kč', 18e9, 'CZK')
      await updateSynthesisResultNarrative(a.id, narrative)
      // b's Narrative is never generated — must show up as null, not be skipped entirely.

      const span = {
        firstEventAt: new Date('2026-01-01T00:00:00Z'),
        lastEventAt: new Date('2026-01-02T00:00:00Z'),
      }
      const { thread } = await upsertThreadFromComponent(
        [
          { storyId: a.storyId, position: 0, role: 'ORIGIN' },
          { storyId: b.storyId, position: 1, role: 'DEVELOPMENT' },
        ],
        span,
        { title: 'Claim tracking case', slug: `claim-tracking-${a.storyId}` }
      )

      const members = await findVisibleMembersForClaimTracking(thread.id)

      expect(members?.every((m) => m.eventTime instanceof Date)).toBe(true)
      expect(members?.map(({ eventTime: _eventTime, ...rest }) => rest)).toEqual([
        { analysisId: a.id, narrative },
        { analysisId: b.id, narrative: null },
      ])
    })
  })

  describe('findProcessedAnalysisIdsForThread / addClaimSeriesMember / findLatestSeriesMembersForThread', () => {
    it('returns an empty set for a Thread with no ClaimSeries yet', async () => {
      const a = await makeCompleteThreadMember('https://example.cz/cs-empty-a', 'A')
      const b = await makeCompleteThreadMember('https://example.cz/cs-empty-b', 'B')
      const span = {
        firstEventAt: new Date('2026-01-01T00:00:00Z'),
        lastEventAt: new Date('2026-01-02T00:00:00Z'),
      }
      const { thread } = await upsertThreadFromComponent(
        [
          { storyId: a.storyId, position: 0, role: 'ORIGIN' },
          { storyId: b.storyId, position: 1, role: 'DEVELOPMENT' },
        ],
        span,
        { title: 'Empty case', slug: `cs-empty-${a.storyId}` }
      )

      expect(await findProcessedAnalysisIdsForThread(thread.id)).toEqual(new Set())
      expect(await findLatestSeriesMembersForThread(thread.id)).toEqual([])
    })

    it('creates a new ClaimSeries when seriesId is null, and joins an existing one when given', async () => {
      const a = await makeCompleteThreadMember('https://example.cz/cs-write-a', 'A')
      const b = await makeCompleteThreadMember('https://example.cz/cs-write-b', 'B')
      const span = {
        firstEventAt: new Date('2026-01-01T00:00:00Z'),
        lastEventAt: new Date('2026-01-02T00:00:00Z'),
      }
      const { thread } = await upsertThreadFromComponent(
        [
          { storyId: a.storyId, position: 0, role: 'ORIGIN' },
          { storyId: b.storyId, position: 1, role: 'DEVELOPMENT' },
        ],
        span,
        { title: 'Write case', slug: `cs-write-${a.storyId}` }
      )

      await addClaimSeriesMember(thread.id, null, {
        analysisId: a.id,
        eventTime: new Date('2026-01-01T00:00:00Z'),
        valueRefId: 'v1',
        text: '52 miliard Kč',
        normalizedValue: 52e9,
        unit: 'CZK',
        sourceIds: ['s1'],
        entityKeys: ['org:ministerstvo-financi'],
      })

      const processedAfterFirst = await findProcessedAnalysisIdsForThread(thread.id)
      expect(processedAfterFirst).toEqual(new Set([a.id]))
      const latestAfterFirst = await findLatestSeriesMembersForThread(thread.id)
      expect(latestAfterFirst).toHaveLength(1)
      expect(latestAfterFirst[0]).toMatchObject({
        entityKeys: ['org:ministerstvo-financi'],
        unit: 'CZK',
        normalizedValue: 52e9,
        text: '52 miliard Kč',
      })
      const seriesId = latestAfterFirst[0].seriesId

      await addClaimSeriesMember(thread.id, seriesId, {
        analysisId: b.id,
        eventTime: new Date('2026-01-02T00:00:00Z'),
        valueRefId: 'v1',
        text: '18 miliard Kč',
        normalizedValue: 18e9,
        unit: 'CZK',
        sourceIds: ['s1'],
        entityKeys: ['org:ministerstvo-financi'],
      })

      const processedAfterSecond = await findProcessedAnalysisIdsForThread(thread.id)
      expect(processedAfterSecond).toEqual(new Set([a.id, b.id]))
      // Still one series (b joined a's, didn't create a second) — but its "latest member" is now
      // b's own point, the later eventTime.
      const latestAfterSecond = await findLatestSeriesMembersForThread(thread.id)
      expect(latestAfterSecond).toHaveLength(1)
      expect(latestAfterSecond[0]).toMatchObject({ seriesId, normalizedValue: 18e9, text: '18 miliard Kč' })
    })
  })
})
