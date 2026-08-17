import { describe, it, expect, afterAll } from 'vitest'
import {
  createAnalysis,
  findAnalysisWithDetails,
  findAllAnalyses,
  updateAnalysisStatus,
  completeAnalysisWithSynthesis,
  disconnect,
} from '../../src/repositories/analysis.js'
import {
  createCoverages,
  excludeCoverages,
  findCoveragesForAnalysis,
} from '../../src/repositories/coverage.js'

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

    const list = await findAllAnalyses(true)
    const olderIndex = list.findIndex((a) => a.id === older.id)
    const newerIndex = list.findIndex((a) => a.id === newer.id)
    const newerEntry = list[newerIndex]
    const olderEntry = list[olderIndex]

    expect(newerIndex).toBeLessThan(olderIndex)
    expect(newerEntry?.okCoverageCount).toBe(1)
    expect(olderEntry?.okCoverageCount).toBe(0)
  })

  it('excludes excluded coverages from the OK count', async () => {
    const analysis = await createAnalysis({ seedUrl: 'https://example.cz/c', seedHeadline: 'Analysis' })

    await createCoverages([
      { analysisId: analysis.id, outlet: 'iDnes', articleUrl: 'https://idnes.cz/kept', status: 'OK' },
      { analysisId: analysis.id, outlet: 'Novinky', articleUrl: 'https://novinky.cz/dropped', status: 'OK' },
    ])

    const [kept] = await findCoveragesForAnalysis(analysis.id)
    await excludeCoverages(analysis.id, [kept.id])

    const list = await findAllAnalyses(true)
    const entry = list.find((a) => a.id === analysis.id)

    expect(entry?.okCoverageCount).toBe(1)
  })

  it('excludes non-complete analyses when includeAllStatuses is false', async () => {
    const pending = await createAnalysis({ seedUrl: 'https://example.cz/d', seedHeadline: 'Still pending' })
    const complete = await createAnalysis({ seedUrl: 'https://example.cz/e', seedHeadline: 'Done' })
    await updateAnalysisStatus(complete.id, 'COMPLETE')

    const list = await findAllAnalyses(false)
    const ids = list.map((a) => a.id)

    expect(ids).toContain(complete.id)
    expect(ids).not.toContain(pending.id)
  })

  it('persists the headline alongside dimensions and flips the Analysis to COMPLETE, all in one transaction', async () => {
    const analysis = await createAnalysis({ seedUrl: 'https://example.cz/f', seedHeadline: 'Working title' })
    const dimensions = { agreement: [], contradiction: [], uniqueReporting: [], framing: [] }

    await completeAnalysisWithSynthesis(analysis.id, dimensions, 'Vláda schválila rozpočet')

    const found = await findAnalysisWithDetails(analysis.id)

    expect(found?.status).toBe('COMPLETE')
    expect(found?.synthesisResult?.headline).toBe('Vláda schválila rozpočet')
    expect(found?.synthesisResult?.dimensions).toEqual(dimensions)
  })

  it('persists a null headline when generation was skipped', async () => {
    const analysis = await createAnalysis({ seedUrl: 'https://example.cz/g', seedHeadline: 'Working title' })
    const dimensions = { agreement: [], contradiction: [], uniqueReporting: [], framing: [] }

    await completeAnalysisWithSynthesis(analysis.id, dimensions, null)

    const found = await findAnalysisWithDetails(analysis.id)

    expect(found?.status).toBe('COMPLETE')
    expect(found?.synthesisResult?.headline).toBeNull()
  })
})
