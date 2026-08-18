import { describe, it, expect, afterAll } from 'vitest'
import {
  createAnalysis,
  findAnalysisWithDetails,
  findAnalysesPage,
  updateAnalysisStatus,
  completeAnalysisWithSynthesis,
  disconnect,
} from '../../src/repositories/analysis.js'
import {
  createCoverages,
  excludeCoverages,
  findCoveragesForAnalysis,
  reconcileCoverages,
  addCoveragesUpToLimit,
  addCoveragesIfWithinLimit,
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
        sourceId: 'src-idnes',
        articleUrl: 'https://idnes.cz/some-article',
        status: 'PENDING',
      },
    ])

    const found = await findAnalysisWithDetails(analysis.id)

    expect(found).not.toBeNull()
    expect(found?.seedHeadline).toBe('Test headline')
    expect(found?.coverages).toHaveLength(1)
    expect(found?.coverages[0]?.source.name).toBe('iDnes')
  })

  it('lists analyses newest first, counting only OK coverages', async () => {
    const older = await createAnalysis({ seedUrl: 'https://example.cz/a', seedHeadline: 'Older analysis' })
    const newer = await createAnalysis({ seedUrl: 'https://example.cz/b', seedHeadline: 'Newer analysis' })

    await createCoverages([
      { analysisId: newer.id, sourceId: 'src-idnes', articleUrl: 'https://idnes.cz/x', status: 'OK' },
      {
        analysisId: newer.id,
        sourceId: 'src-novinky',
        articleUrl: 'https://novinky.cz/y',
        status: 'PENDING',
      },
    ])

    const list = await findAnalysesPage(true, undefined, 50)
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
      { analysisId: analysis.id, sourceId: 'src-idnes', articleUrl: 'https://idnes.cz/kept', status: 'OK' },
      {
        analysisId: analysis.id,
        sourceId: 'src-novinky',
        articleUrl: 'https://novinky.cz/dropped',
        status: 'OK',
      },
    ])

    const [kept] = await findCoveragesForAnalysis(analysis.id)
    await excludeCoverages(analysis.id, [kept.id])

    const list = await findAnalysesPage(true, undefined, 50)
    const entry = list.find((a) => a.id === analysis.id)

    expect(entry?.okCoverageCount).toBe(1)
  })

  it('excludes non-complete analyses when includeAllStatuses is false', async () => {
    const pending = await createAnalysis({ seedUrl: 'https://example.cz/d', seedHeadline: 'Still pending' })
    const complete = await createAnalysis({ seedUrl: 'https://example.cz/e', seedHeadline: 'Done' })
    await updateAnalysisStatus(complete.id, 'COMPLETE')

    const list = await findAnalysesPage(false, undefined, 50)
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

  it('reconcileCoverages rolls back exclude/include entirely when the cap check fails', async () => {
    const analysis = await createAnalysis({ seedUrl: 'https://example.cz/h', seedHeadline: 'Cap test' })
    await createCoverages([
      {
        analysisId: analysis.id,
        sourceId: 'src-idnes',
        articleUrl: 'https://idnes.cz/h1',
        status: 'PENDING',
      },
      {
        analysisId: analysis.id,
        sourceId: 'src-novinky',
        articleUrl: 'https://novinky.cz/h2',
        status: 'PENDING',
      },
      {
        analysisId: analysis.id,
        sourceId: 'src-aktualne',
        articleUrl: 'https://aktualne.cz/h3',
        status: 'PENDING',
      },
    ])
    const all = await findCoveragesForAnalysis(analysis.id)
    const [kept1, kept2, previouslyExcluded] = all
    await excludeCoverages(analysis.id, [kept1.id, kept2.id])

    // Re-including the previously-excluded row would push active count to 3, over the cap of 2.
    const result = await reconcileCoverages(analysis.id, [kept1.id, kept2.id, previouslyExcluded.id], [], 2)

    expect(result).toEqual({ ok: false, activeCount: 3 })
    const stillActive = await findCoveragesForAnalysis(analysis.id)
    expect(stillActive.map((c) => c.id).sort()).toEqual([kept1.id, kept2.id].sort())
  })

  it('reconcileCoverages atomically excludes non-confirmed, includes confirmed, and inserts new coverages', async () => {
    const analysis = await createAnalysis({ seedUrl: 'https://example.cz/i', seedHeadline: 'Reconcile test' })
    await createCoverages([
      {
        analysisId: analysis.id,
        sourceId: 'src-idnes',
        articleUrl: 'https://idnes.cz/i1',
        status: 'PENDING',
      },
      {
        analysisId: analysis.id,
        sourceId: 'src-novinky',
        articleUrl: 'https://novinky.cz/i2',
        status: 'PENDING',
      },
    ])
    const [confirmed, toExclude] = await findCoveragesForAnalysis(analysis.id)

    const result = await reconcileCoverages(
      analysis.id,
      [confirmed.id],
      [
        {
          analysisId: analysis.id,
          sourceId: 'src-aktualne',
          articleUrl: 'https://aktualne.cz/i3',
          status: 'PENDING',
        },
      ],
      5
    )

    expect(result).toEqual({ ok: true })
    const active = await findCoveragesForAnalysis(analysis.id)
    expect(active.map((c) => c.sourceId).sort()).toEqual(['src-aktualne', 'src-idnes'].sort())
    expect(active.some((c) => c.id === toExclude.id)).toBe(false)
  })

  it('addCoveragesUpToLimit truncates new coverages to whatever room remains under the cap', async () => {
    const analysis = await createAnalysis({ seedUrl: 'https://example.cz/j', seedHeadline: 'Truncate test' })
    await createCoverages([
      {
        analysisId: analysis.id,
        sourceId: 'src-idnes',
        articleUrl: 'https://idnes.cz/j1',
        status: 'PENDING',
      },
    ])

    const result = await addCoveragesUpToLimit(
      analysis.id,
      [
        {
          analysisId: analysis.id,
          sourceId: 'src-novinky',
          articleUrl: 'https://novinky.cz/j2',
          status: 'PENDING',
        },
        {
          analysisId: analysis.id,
          sourceId: 'src-aktualne',
          articleUrl: 'https://aktualne.cz/j3',
          status: 'PENDING',
        },
        {
          analysisId: analysis.id,
          sourceId: 'src-ct24',
          articleUrl: 'https://ct24.cz/j4',
          status: 'PENDING',
        },
      ],
      3
    )

    expect(result.inserted).toHaveLength(2)
    expect(result.droppedCount).toBe(1)
    const active = await findCoveragesForAnalysis(analysis.id)
    expect(active).toHaveLength(3)
  })

  it('addCoveragesIfWithinLimit reports ok:false when a colliding insert is silently skipped by skipDuplicates', async () => {
    const analysis = await createAnalysis({ seedUrl: 'https://example.cz/k', seedHeadline: 'Collision test' })
    await createCoverages([
      {
        analysisId: analysis.id,
        sourceId: 'src-idnes',
        articleUrl: 'https://idnes.cz/k-original',
        status: 'PENDING',
      },
    ])

    // src-idnes already has an active Coverage row — createMany's skipDuplicates will no-op this
    // insert rather than throw, since it collides on the partial unique index.
    const result = await addCoveragesIfWithinLimit(
      analysis.id,
      [
        {
          analysisId: analysis.id,
          sourceId: 'src-idnes',
          articleUrl: 'https://idnes.cz/k-colliding',
          status: 'PENDING',
        },
      ],
      25
    )

    expect(result).toEqual({ ok: false, activeCount: 1 })
    const active = await findCoveragesForAnalysis(analysis.id)
    expect(active).toHaveLength(1)
    expect(active[0]?.articleUrl).toBe('https://idnes.cz/k-original')
  })

  it('addCoveragesUpToLimit excludes a candidate whose insert was silently skipped from `inserted`', async () => {
    const analysis = await createAnalysis({
      seedUrl: 'https://example.cz/l',
      seedHeadline: 'Partial collision test',
    })
    await createCoverages([
      {
        analysisId: analysis.id,
        sourceId: 'src-idnes',
        articleUrl: 'https://idnes.cz/l-original',
        status: 'PENDING',
      },
    ])

    const result = await addCoveragesUpToLimit(
      analysis.id,
      [
        {
          analysisId: analysis.id,
          sourceId: 'src-idnes',
          articleUrl: 'https://idnes.cz/l-colliding',
          status: 'PENDING',
        },
        {
          analysisId: analysis.id,
          sourceId: 'src-novinky',
          articleUrl: 'https://novinky.cz/l2',
          status: 'PENDING',
        },
      ],
      25
    )

    expect(result.inserted).toEqual([
      {
        analysisId: analysis.id,
        sourceId: 'src-novinky',
        articleUrl: 'https://novinky.cz/l2',
        status: 'PENDING',
      },
    ])
    expect(result.droppedCount).toBe(1)
    const active = await findCoveragesForAnalysis(analysis.id)
    expect(active.map((c) => c.sourceId).sort()).toEqual(['src-idnes', 'src-novinky'])
  })
})
