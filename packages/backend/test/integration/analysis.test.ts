import { describe, it, expect, afterAll } from 'vitest'
import {
  createAnalysis,
  findAnalysisWithDetails,
  findAllAnalyses,
  disconnect,
} from '../../src/repositories/analysis.js'
import { createCoverages } from '../../src/repositories/coverage.js'

describe('Analysis + Coverage repositories against a real Postgres instance', () => {
  afterAll(async () => {
    await disconnect()
  })

  it('persists an Analysis with a related Coverage and reads it back', async () => {
    const analysis = await createAnalysis({
      seedUrl: 'https://example.cz/some-article',
      seedHeadline: 'Test headline',
    })

    await createCoverages([
      {
        analysisId: analysis.id,
        outlet: 'iDnes',
        articleUrl: 'https://idnes.cz/some-article',
        status: 'PENDING',
      },
    ])

    const found = await findAnalysisWithDetails(analysis.id)

    expect(found).not.toBeNull()
    expect(found?.seedHeadline).toBe('Test headline')
    expect(found?.coverages).toHaveLength(1)
    expect(found?.coverages[0]?.outlet).toBe('iDnes')
  })

  it('lists analyses newest first, counting only OK coverages', async () => {
    const older = await createAnalysis({ seedUrl: 'https://example.cz/a', seedHeadline: 'Older analysis' })
    const newer = await createAnalysis({ seedUrl: 'https://example.cz/b', seedHeadline: 'Newer analysis' })

    await createCoverages([
      { analysisId: newer.id, outlet: 'iDnes', articleUrl: 'https://idnes.cz/x', status: 'OK' },
      { analysisId: newer.id, outlet: 'Novinky', articleUrl: 'https://novinky.cz/y', status: 'PENDING' },
    ])

    const list = await findAllAnalyses()
    const olderIndex = list.findIndex((a) => a.id === older.id)
    const newerIndex = list.findIndex((a) => a.id === newer.id)
    const newerEntry = list[newerIndex]
    const olderEntry = list[olderIndex]

    expect(newerIndex).toBeLessThan(olderIndex)
    expect(newerEntry?.okCoverageCount).toBe(1)
    expect(olderEntry?.okCoverageCount).toBe(0)
  })
})
