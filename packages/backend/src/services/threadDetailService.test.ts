import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as threadDetailRepo from '../repositories/threadDetail.js'
import * as entityRepo from '../repositories/entity.js'
import { getThreadDetail } from './threadDetailService.js'
import { NotFoundError } from '../errors.js'

vi.mock('../repositories/threadDetail.js')
vi.mock('../repositories/entity.js')

const DIMENSIONS = { agreement: [], contradiction: [], uniqueReporting: [], framing: [] }

function makeMember(analysisId: string, storyId: string) {
  return {
    analysisId,
    storyId,
    seedHeadline: `Seed ${analysisId}`,
    headline: `Headline ${analysisId}`,
    eventTime: new Date('2026-08-13T00:00:00Z'),
    dimensions: DIMENSIONS,
    agreementCategory: 'PARTIAL' as const,
    sourceOverlapPercentage: 70,
    coverages: [],
  }
}

function makeThread(members: ReturnType<typeof makeMember>[]) {
  return {
    title: 'Vícedílná kauza',
    slug: 'vicedilna-kauza',
    status: 'ACTIVE' as const,
    firstEventAt: new Date('2026-08-13T00:00:00Z'),
    lastEventAt: new Date('2026-08-18T00:00:00Z'),
    members,
  }
}

describe('getThreadDetail', () => {
  beforeEach(() => vi.resetAllMocks())

  it('throws NotFoundError for a slug that resolves to nothing', async () => {
    vi.mocked(threadDetailRepo.findThreadDetailBySlug).mockResolvedValue(null)

    await expect(getThreadDetail('unknown')).rejects.toThrow(NotFoundError)
  })

  it('throws NotFoundError when fewer than 2 members are currently visible (COMPLETE) — never leaks existence', async () => {
    vi.mocked(threadDetailRepo.findThreadDetailBySlug).mockResolvedValue(makeThread([makeMember('a1', 's1')]))

    await expect(getThreadDetail('vicedilna-kauza')).rejects.toThrow(NotFoundError)
  })

  it('returns the mapped detail and aggregates entities across every member Story', async () => {
    vi.mocked(threadDetailRepo.findThreadDetailBySlug).mockResolvedValue(
      makeThread([makeMember('a1', 's1'), makeMember('a2', 's2')])
    )
    vi.mocked(entityRepo.findEntityMentionsForStories).mockResolvedValue([
      { key: 'e1', canonicalName: 'Entity One', type: 'PERSON', imageUrl: null },
      { key: 'e1', canonicalName: 'Entity One', type: 'PERSON', imageUrl: null },
      { key: 'e2', canonicalName: 'Entity Two', type: 'PLACE', imageUrl: null },
    ])

    const result = await getThreadDetail('vicedilna-kauza')

    expect(entityRepo.findEntityMentionsForStories).toHaveBeenCalledWith(['s1', 's2'])
    expect(result.entities).toEqual([
      { key: 'e1', canonicalName: 'Entity One', type: 'PERSON' },
      { key: 'e2', canonicalName: 'Entity Two', type: 'PLACE' },
    ])
    expect(result.slug).toBe('vicedilna-kauza')
  })
})
