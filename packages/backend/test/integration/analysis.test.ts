import { describe, it, expect, afterAll } from 'vitest'
import { createAnalysis, findAnalysisWithDetails, disconnect } from '../../src/repositories/analysis.js'
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
})
