import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as analysisRepo from '../repositories/analysis.js'
import { searchArticles } from './searchService.js'

vi.mock('../repositories/analysis.js')

function makeRow(id: string) {
  return {
    id,
    seedHeadline: `Seed ${id}`,
    headline: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    status: 'COMPLETE' as const,
    okCoverageCount: 3,
    coverages: [],
    dimensions: null,
    sourceOverlapPercentage: null,
    leadImage: null,
    entityNames: [],
  }
}

describe('searchArticles', () => {
  beforeEach(() => vi.resetAllMocks())

  it('passes the query and a bounded limit through to the repository', async () => {
    vi.mocked(analysisRepo.findAnalysesBySearch).mockResolvedValue([])

    await searchArticles('unijní rozpočet')

    expect(analysisRepo.findAnalysesBySearch).toHaveBeenCalledWith('unijní rozpočet', 20)
  })

  it('maps ranked repository rows to AnalysisListItems, preserving their order', async () => {
    vi.mocked(analysisRepo.findAnalysesBySearch).mockResolvedValue([makeRow('a1'), makeRow('a2')])

    const result = await searchArticles('rozpočet')

    expect(result.map((r) => r.id)).toEqual(['a1', 'a2'])
    expect(result[0]).toMatchObject({ status: 'complete' })
  })
})
