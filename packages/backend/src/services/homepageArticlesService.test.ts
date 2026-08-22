import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as homepageArticlesRepo from '../repositories/homepageArticles.js'
import {
  getHomepageArticles,
  HOMEPAGE_ARTICLES_LIMIT,
  HOMEPAGE_ARTICLES_SPOTLIGHT_COUNT,
  HOMEPAGE_ARTICLES_LATEST_COUNT,
} from './homepageArticlesService.js'

vi.mock('../repositories/homepageArticles.js')

const DIMENSIONS = {
  agreement: [],
  contradiction: [],
  uniqueReporting: [],
  framing: [],
  agreementCategory: 'PARTIAL' as const,
}

function makeRow(id: string, createdAt: string) {
  return {
    id,
    seedHeadline: `Seed ${id}`,
    headline: `Headline ${id}`,
    createdAt: new Date(createdAt),
    status: 'COMPLETE' as const,
    okCoverageCount: 3,
    coverages: [],
    dimensions: DIMENSIONS,
    sourceOverlapPercentage: null,
    leadImage: null,
    entityNames: [],
  }
}

describe('getHomepageArticles', () => {
  beforeEach(() => vi.resetAllMocks())

  it('requests exactly lead + spotlight + latest rows from the repository', async () => {
    vi.mocked(homepageArticlesRepo.findHomepageArticleRows).mockResolvedValue([])

    await getHomepageArticles()

    expect(homepageArticlesRepo.findHomepageArticleRows).toHaveBeenCalledWith(HOMEPAGE_ARTICLES_LIMIT)
    expect(HOMEPAGE_ARTICLES_LIMIT).toBe(
      1 + HOMEPAGE_ARTICLES_SPOTLIGHT_COUNT + HOMEPAGE_ARTICLES_LATEST_COUNT
    )
  })

  it('slots the first row as lead, next two as spotlight, next eight as latest', async () => {
    const rows = Array.from({ length: 11 }, (_, i) => makeRow(`a${i}`, `2026-08-${21 - i}T00:00:00Z`))
    vi.mocked(homepageArticlesRepo.findHomepageArticleRows).mockResolvedValue(rows)

    const result = await getHomepageArticles()

    expect(result.lead?.id).toBe('a0')
    expect(result.spotlight.map((item) => item.id)).toEqual(['a1', 'a2'])
    expect(result.latest.map((item) => item.id)).toEqual(['a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10'])
    expect(result.lead?.status).toBe('complete')
    expect(result.lead?.summary).toBeDefined()
  })

  it('returns a null lead and empty slots when there are no COMPLETE Articles yet', async () => {
    vi.mocked(homepageArticlesRepo.findHomepageArticleRows).mockResolvedValue([])

    await expect(getHomepageArticles()).resolves.toEqual({ lead: null, spotlight: [], latest: [] })
  })

  it('returns fewer than eight latest items, never padded, when only a handful of rows exist', async () => {
    const rows = [makeRow('a0', '2026-08-21T00:00:00Z'), makeRow('a1', '2026-08-20T00:00:00Z')]
    vi.mocked(homepageArticlesRepo.findHomepageArticleRows).mockResolvedValue(rows)

    const result = await getHomepageArticles()

    expect(result.lead?.id).toBe('a0')
    expect(result.spotlight.map((item) => item.id)).toEqual(['a1'])
    expect(result.latest).toEqual([])
  })
})
