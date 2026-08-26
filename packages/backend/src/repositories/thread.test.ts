import { describe, it, expect } from 'vitest'
import { rankVisibleThreads, type RawThreadForRanking } from './thread.js'

function member(status: string | null, eventTime: Date | null, createdAt = new Date('2026-01-01T00:00:00Z')) {
  return { story: { eventTime, createdAt, analysis: status === null ? null : { status } } }
}

function thread(slug: string, members: RawThreadForRanking['members']): RawThreadForRanking {
  return { slug, title: `Title ${slug}`, members }
}

describe('rankVisibleThreads', () => {
  it('excludes a Thread with fewer than 2 currently-visible (COMPLETE) members', () => {
    const result = rankVisibleThreads([
      thread('t1', [
        member('COMPLETE', new Date('2026-08-01T00:00:00Z')),
        member('DRAFT', new Date('2026-08-02T00:00:00Z')),
      ]),
    ])

    expect(result).toEqual([])
  })

  it("uses only visible members' own eventTime span, never a still-DRAFT member's newer one", () => {
    const result = rankVisibleThreads([
      thread('t1', [
        member('COMPLETE', new Date('2026-08-01T00:00:00Z')),
        member('COMPLETE', new Date('2026-08-05T00:00:00Z')),
        // Newest member overall, but not COMPLETE — must never win the "last updated" date.
        member('DRAFT', new Date('2026-08-20T00:00:00Z')),
      ]),
    ])

    expect(result[0]?.lastVisibleEventAt).toEqual(new Date('2026-08-05T00:00:00Z'))
  })

  it('falls back to createdAt for a visible member with a null eventTime', () => {
    const result = rankVisibleThreads([
      thread('t1', [
        member('COMPLETE', null, new Date('2026-08-03T00:00:00Z')),
        member('COMPLETE', new Date('2026-08-01T00:00:00Z')),
      ]),
    ])

    expect(result[0]?.lastVisibleEventAt).toEqual(new Date('2026-08-03T00:00:00Z'))
  })

  it('orders by lastVisibleEventAt descending, breaking an exact tie by slug ascending', () => {
    const tie = new Date('2026-08-10T00:00:00Z')
    const result = rankVisibleThreads([
      thread('z-thread', [member('COMPLETE', tie), member('COMPLETE', tie)]),
      thread('a-thread', [member('COMPLETE', tie), member('COMPLETE', tie)]),
    ])

    expect(result.map((t) => t.slug)).toEqual(['a-thread', 'z-thread'])
  })

  it('includes every visible Thread, not just a fixed-size window — callers slice as they need', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      thread(`thread-${i}`, [
        member('COMPLETE', new Date(`2026-08-${1 + (i % 28)}T00:00:00Z`)),
        member('COMPLETE', new Date(`2026-08-${1 + (i % 28)}T00:00:00Z`)),
      ])
    )

    const result = rankVisibleThreads(many)

    expect(result).toHaveLength(20)
  })

  it('orders the full candidate set correctly, regardless of input order', () => {
    const result = rankVisibleThreads([
      thread('t1', [
        member('COMPLETE', new Date('2026-08-01T00:00:00Z')),
        member('COMPLETE', new Date('2026-08-01T00:00:00Z')),
      ]),
      thread('t3', [
        member('COMPLETE', new Date('2026-08-03T00:00:00Z')),
        member('COMPLETE', new Date('2026-08-03T00:00:00Z')),
      ]),
      thread('t2', [
        member('COMPLETE', new Date('2026-08-02T00:00:00Z')),
        member('COMPLETE', new Date('2026-08-02T00:00:00Z')),
      ]),
    ])

    expect(result.map((t) => t.slug)).toEqual(['t3', 't2', 't1'])
  })
})
