import { describe, it, expect } from 'vitest'
import { toThreadSummary } from './thread.js'
import type { ThreadForReader } from '../repositories/thread.js'

const THREAD: ThreadForReader = {
  title: 'Vícedílná kauza',
  memberCount: 3,
  members: [
    { analysisId: 'a1', seedHeadline: 'Seed 1', headline: 'Generated 1', status: 'COMPLETE', position: 0 },
    { analysisId: 'a2', seedHeadline: 'Seed 2', headline: null, status: 'PENDING', position: 1 },
    { analysisId: 'a3', seedHeadline: 'Seed 3', headline: 'Generated 3', status: 'COMPLETE', position: 2 },
  ],
}

describe('toThreadSummary', () => {
  it('includes only COMPLETE members, resolving each to its display title', () => {
    const result = toThreadSummary('a1', THREAD)

    expect(result.members).toEqual([
      { analysisId: 'a1', title: 'Generated 1', isCurrent: true },
      { analysisId: 'a3', title: 'Generated 3', isCurrent: false },
    ])
  })

  it("reports memberCount as the visible (COMPLETE) count, not the Thread's raw total", () => {
    const result = toThreadSummary('a1', THREAD)

    expect(result.memberCount).toBe(2)
    expect(result.memberCount).not.toBe(THREAD.memberCount)
  })

  it('marks isCurrent for whichever member matches the given analysisId, even if not the first', () => {
    const result = toThreadSummary('a3', THREAD)

    expect(result.members.find((m) => m.analysisId === 'a3')?.isCurrent).toBe(true)
    expect(result.members.find((m) => m.analysisId === 'a1')?.isCurrent).toBe(false)
  })

  it('falls back to seedHeadline when a member has no generated headline', () => {
    const threadWithUngenerated: ThreadForReader = {
      ...THREAD,
      members: [
        { analysisId: 'a4', seedHeadline: 'Seed only', headline: null, status: 'COMPLETE', position: 0 },
      ],
    }

    const result = toThreadSummary('a4', threadWithUngenerated)

    expect(result.members[0]?.title).toBe('Seed only')
  })

  it('carries the Thread title through unchanged', () => {
    const result = toThreadSummary('a1', THREAD)

    expect(result.title).toBe('Vícedílná kauza')
  })
})
