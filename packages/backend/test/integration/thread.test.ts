import { describe, it, expect, afterAll } from 'vitest'
import { createAnalysis, completeAnalysisWithSynthesis, disconnect } from '../../src/repositories/analysis.js'
import { createStoryRelation } from '../../src/repositories/storyRelation.js'
import {
  findFollowUpComponent,
  findAgreementForTitle,
  upsertThreadFromComponent,
  findThreadForStory,
  setThreadStatusForTesting,
} from '../../src/repositories/thread.js'

async function follow(
  fromStoryId: string,
  toStoryId: string,
  status: 'PUBLISHED' | 'PENDING_REVIEW' = 'PUBLISHED'
) {
  await createStoryRelation({
    fromStoryId,
    toStoryId,
    type: 'FOLLOW_UP',
    confidenceTier: status === 'PUBLISHED' ? 'HIGH' : 'LOW',
    reasoning: 'test edge',
    status,
  })
}

describe('Thread repository against a real Postgres instance', () => {
  afterAll(async () => {
    await disconnect()
  })

  describe('findFollowUpComponent', () => {
    it('returns just the seed when it has no edges at all', async () => {
      const a = await createAnalysis({ seedUrl: 'https://example.cz/thread-lone', seedHeadline: 'x' })

      const members = await findFollowUpComponent(a.storyId)

      expect(members.map((m) => m.storyId)).toEqual([a.storyId])
    })

    it('follows PUBLISHED FOLLOW_UP edges transitively and orders oldest-first by eventTime', async () => {
      const now = new Date('2026-02-01T00:00:00Z')
      const a = await createAnalysis({
        seedUrl: 'https://example.cz/thread-chain-a',
        seedHeadline: 'A',
        eventTime: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      })
      const b = await createAnalysis({
        seedUrl: 'https://example.cz/thread-chain-b',
        seedHeadline: 'B',
        eventTime: new Date(now.getTime() - 1 * 60 * 60 * 1000),
      })
      const c = await createAnalysis({
        seedUrl: 'https://example.cz/thread-chain-c',
        seedHeadline: 'C',
        eventTime: now,
      })
      await follow(b.storyId, a.storyId)
      await follow(c.storyId, b.storyId)

      const members = await findFollowUpComponent(a.storyId)

      expect(members.map((m) => m.storyId)).toEqual([a.storyId, b.storyId, c.storyId])
    })

    it('excludes a PENDING_REVIEW edge — only PUBLISHED FOLLOW_UP edges form the component', async () => {
      const a = await createAnalysis({ seedUrl: 'https://example.cz/thread-pending-a', seedHeadline: 'A' })
      const b = await createAnalysis({ seedUrl: 'https://example.cz/thread-pending-b', seedHeadline: 'B' })
      await follow(b.storyId, a.storyId, 'PENDING_REVIEW')

      const members = await findFollowUpComponent(a.storyId)

      expect(members.map((m) => m.storyId)).toEqual([a.storyId])
    })

    it('excludes a RELATED edge — only FOLLOW_UP counts, even when PUBLISHED', async () => {
      const a = await createAnalysis({ seedUrl: 'https://example.cz/thread-related-a', seedHeadline: 'A' })
      const b = await createAnalysis({ seedUrl: 'https://example.cz/thread-related-b', seedHeadline: 'B' })
      await createStoryRelation({
        fromStoryId: b.storyId,
        toStoryId: a.storyId,
        type: 'RELATED',
        confidenceTier: 'HIGH',
        reasoning: 'test',
        status: 'PUBLISHED',
      })

      const members = await findFollowUpComponent(a.storyId)

      expect(members.map((m) => m.storyId)).toEqual([a.storyId])
    })

    it('falls back to createdAt for ordering when eventTime is null', async () => {
      // Human-seeded createAnalysis (no eventTime passed) leaves it null (ticket 16) — ordering
      // must still be well-defined via the createdAt fallback baked into the SQL's COALESCE.
      const a = await createAnalysis({ seedUrl: 'https://example.cz/thread-null-event-a', seedHeadline: 'A' })
      const b = await createAnalysis({ seedUrl: 'https://example.cz/thread-null-event-b', seedHeadline: 'B' })
      await follow(b.storyId, a.storyId)

      const members = await findFollowUpComponent(a.storyId)

      expect(members).toHaveLength(2)
      expect(members.every((m) => m.eventTime instanceof Date)).toBe(true)
    })
  })

  describe('findAgreementForTitle', () => {
    it("flattens each Story's own SynthesisResult Agreement prose and resolves its display title", async () => {
      const a = await createAnalysis({ seedUrl: 'https://example.cz/thread-title-a', seedHeadline: 'Seed A' })
      await completeAnalysisWithSynthesis(
        a.id,
        {
          agreement: [{ prose: 'Fakt 1', attributions: [] }],
          contradiction: [],
          uniqueReporting: [],
          framing: [],
        },
        'Generated A'
      )
      const b = await createAnalysis({ seedUrl: 'https://example.cz/thread-title-b', seedHeadline: 'Seed B' })
      // No SynthesisResult at all for b — an Analysis that hasn't reached COMPLETE yet.

      const result = await findAgreementForTitle([a.storyId, b.storyId])

      const found = (storyId: string) => result.find((r) => r.storyId === storyId)
      expect(found(a.storyId)).toEqual({
        storyId: a.storyId,
        displayTitle: 'Generated A',
        agreementProse: ['Fakt 1'],
      })
      expect(found(b.storyId)).toEqual({ storyId: b.storyId, displayTitle: 'Seed B', agreementProse: [] })
    })
  })

  describe('upsertThreadFromComponent', () => {
    it('creates a new Thread with the given members, span, and title/slug when none exists yet', async () => {
      const a = await createAnalysis({ seedUrl: 'https://example.cz/thread-create-a', seedHeadline: 'A' })
      const b = await createAnalysis({ seedUrl: 'https://example.cz/thread-create-b', seedHeadline: 'B' })
      // Recent, not a fixed historical date — a lastEventAt more than 30 days in the past would
      // compute as DORMANT (see the dedicated DORMANT test below), which isn't what this test is
      // checking.
      const firstEventAt = new Date(Date.now() - 60 * 60 * 1000)
      const lastEventAt = new Date()

      const thread = await upsertThreadFromComponent(
        [
          { storyId: a.storyId, position: 0, role: 'ORIGIN' },
          { storyId: b.storyId, position: 1, role: 'DEVELOPMENT' },
        ],
        { firstEventAt, lastEventAt },
        { title: 'Kauza X', slug: `kauza-x-${a.storyId}` }
      )

      expect(thread.title).toBe('Kauza X')
      expect(thread.status).toBe('ACTIVE')
      expect(thread.memberCount).toBe(2)
      expect(thread.firstEventAt).toEqual(firstEventAt)
      expect(thread.lastEventAt).toEqual(lastEventAt)

      const reader = await findThreadForStory(a.storyId)
      expect(reader?.members.map((m) => m.analysisId).sort()).toEqual([a.id, b.id].sort())
    })

    it('joins the existing Thread instead of creating a duplicate when a member already belongs to one', async () => {
      const a = await createAnalysis({ seedUrl: 'https://example.cz/thread-join-a', seedHeadline: 'A' })
      const b = await createAnalysis({ seedUrl: 'https://example.cz/thread-join-b', seedHeadline: 'B' })
      const c = await createAnalysis({ seedUrl: 'https://example.cz/thread-join-c', seedHeadline: 'C' })
      const span = {
        firstEventAt: new Date('2026-01-01T00:00:00Z'),
        lastEventAt: new Date('2026-01-02T00:00:00Z'),
      }
      const first = await upsertThreadFromComponent(
        [
          { storyId: a.storyId, position: 0, role: 'ORIGIN' },
          { storyId: b.storyId, position: 1, role: 'DEVELOPMENT' },
        ],
        span,
        { title: 'First title', slug: `first-title-${a.storyId}` }
      )

      const second = await upsertThreadFromComponent(
        [
          { storyId: a.storyId, position: 0, role: 'ORIGIN' },
          { storyId: b.storyId, position: 1, role: 'DEVELOPMENT' },
          { storyId: c.storyId, position: 2, role: 'RESOLUTION' },
        ],
        { ...span, lastEventAt: new Date('2026-01-03T00:00:00Z') },
        { title: 'Would-be second title', slug: `second-title-${a.storyId}` }
      )

      expect(second.id).toBe(first.id)
      expect(second.title).toBe('First title')
      expect(second.memberCount).toBe(3)
      const reader = await findThreadForStory(c.storyId)
      expect(reader?.members.map((m) => m.analysisId).sort()).toEqual([a.id, b.id, c.id].sort())
    })

    it('marks the Thread DORMANT when its last member is more than 30 days old', async () => {
      const a = await createAnalysis({ seedUrl: 'https://example.cz/thread-dormant-a', seedHeadline: 'A' })
      const b = await createAnalysis({ seedUrl: 'https://example.cz/thread-dormant-b', seedHeadline: 'B' })
      const oldSpan = {
        firstEventAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        lastEventAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
      }

      const thread = await upsertThreadFromComponent(
        [
          { storyId: a.storyId, position: 0, role: 'ORIGIN' },
          { storyId: b.storyId, position: 1, role: 'DEVELOPMENT' },
        ],
        oldSpan,
        { title: 'Old case', slug: `old-case-${a.storyId}` }
      )

      expect(thread.status).toBe('DORMANT')
    })

    it('never reopens a CLOSED Thread on a later recompute', async () => {
      const a = await createAnalysis({ seedUrl: 'https://example.cz/thread-closed-a', seedHeadline: 'A' })
      const b = await createAnalysis({ seedUrl: 'https://example.cz/thread-closed-b', seedHeadline: 'B' })
      const span = {
        firstEventAt: new Date('2026-01-01T00:00:00Z'),
        lastEventAt: new Date('2026-01-02T00:00:00Z'),
      }
      const created = await upsertThreadFromComponent(
        [
          { storyId: a.storyId, position: 0, role: 'ORIGIN' },
          { storyId: b.storyId, position: 1, role: 'DEVELOPMENT' },
        ],
        span,
        { title: 'Closed case', slug: `closed-case-${a.storyId}` }
      )
      await setThreadStatusForTesting(created.id, 'CLOSED')

      const recomputed = await upsertThreadFromComponent(
        [
          { storyId: a.storyId, position: 0, role: 'ORIGIN' },
          { storyId: b.storyId, position: 1, role: 'DEVELOPMENT' },
        ],
        { ...span, lastEventAt: new Date() },
        { title: 'Closed case', slug: `closed-case-2-${a.storyId}` }
      )

      expect(recomputed.status).toBe('CLOSED')
    })
  })

  describe('findThreadForStory', () => {
    it('returns null when the Story is not in any Thread', async () => {
      const a = await createAnalysis({ seedUrl: 'https://example.cz/thread-reader-none', seedHeadline: 'A' })

      const result = await findThreadForStory(a.storyId)

      expect(result).toBeNull()
    })

    it("returns the Thread's title, memberCount, and every member's Analysis id/title inputs/status, ordered by position", async () => {
      const a = await createAnalysis({
        seedUrl: 'https://example.cz/thread-reader-a',
        seedHeadline: 'Seed A',
      })
      const b = await createAnalysis({
        seedUrl: 'https://example.cz/thread-reader-b',
        seedHeadline: 'Seed B',
      })
      await completeAnalysisWithSynthesis(
        b.id,
        { agreement: [], contradiction: [], uniqueReporting: [], framing: [] },
        'Generated B'
      )
      const span = {
        firstEventAt: new Date('2026-01-01T00:00:00Z'),
        lastEventAt: new Date('2026-01-02T00:00:00Z'),
      }
      await upsertThreadFromComponent(
        [
          { storyId: a.storyId, position: 0, role: 'ORIGIN' },
          { storyId: b.storyId, position: 1, role: 'DEVELOPMENT' },
        ],
        span,
        { title: 'Reader-visible case', slug: `reader-case-${a.storyId}` }
      )

      const result = await findThreadForStory(a.storyId)

      expect(result?.title).toBe('Reader-visible case')
      expect(result?.memberCount).toBe(2)
      expect(result?.members).toEqual([
        { analysisId: a.id, seedHeadline: 'Seed A', headline: null, status: 'PENDING', position: 0 },
        {
          analysisId: b.id,
          seedHeadline: 'Seed B',
          headline: 'Generated B',
          status: 'COMPLETE',
          position: 1,
        },
      ])
    })
  })
})
