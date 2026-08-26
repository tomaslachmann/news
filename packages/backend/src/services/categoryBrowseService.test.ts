import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as analysisRepo from '../repositories/analysis.js'
import { listAnalysesByCategory } from './categoryBrowseService.js'
import { ValidationError } from '../errors.js'

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

describe('listAnalysesByCategory', () => {
  beforeEach(() => vi.resetAllMocks())

  it('uppercases the slug and passes the real ArticleCategory value to the repository', async () => {
    vi.mocked(analysisRepo.findAnalysesByCategoryPage).mockResolvedValue([])

    await listAnalysesByCategory('domestic', undefined, 20)

    expect(analysisRepo.findAnalysesByCategoryPage).toHaveBeenCalledWith('DOMESTIC', undefined, 20)
  })

  it('maps repository rows to AnalysisListItems', async () => {
    vi.mocked(analysisRepo.findAnalysesByCategoryPage).mockResolvedValue([makeRow('a1'), makeRow('a2')])

    const result = await listAnalysesByCategory('sport', undefined, 20)

    expect(result.items).toEqual([
      expect.objectContaining({ id: 'a1', status: 'complete' }),
      expect.objectContaining({ id: 'a2', status: 'complete' }),
    ])
    expect(result.nextCursor).toBeNull()
  })

  it('throws ValidationError for an unknown category slug, never calling the repository', async () => {
    await expect(listAnalysesByCategory('energetika', undefined, 20)).rejects.toThrow(ValidationError)
    expect(analysisRepo.findAnalysesByCategoryPage).not.toHaveBeenCalled()
  })

  it('throws ValidationError for a slug that is real Czech text but not a real enum value', async () => {
    await expect(listAnalysesByCategory('regiony', undefined, 20)).rejects.toThrow(ValidationError)
  })

  it('accepts every real ArticleCategory value, case-insensitively', async () => {
    vi.mocked(analysisRepo.findAnalysesByCategoryPage).mockResolvedValue([])

    await listAnalysesByCategory('REGIONAL', undefined, 20)

    expect(analysisRepo.findAnalysesByCategoryPage).toHaveBeenCalledWith('REGIONAL', undefined, 20)
  })
})
