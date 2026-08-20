import { describe, it, expect, afterAll } from 'vitest'
import { createAnalysis, completeAnalysisWithSynthesis, disconnect } from '../../src/repositories/analysis.js'
import {
  findSynthesisResultByAnalysisId,
  markNarrativeGenerationFailed,
} from '../../src/repositories/synthesisResult.js'

describe('SynthesisResult repository against a real Postgres instance', () => {
  afterAll(async () => {
    await disconnect()
  })

  it('markNarrativeGenerationFailed sets narrativeGenerationFailedAt without touching narrative/dimensions/headline', async () => {
    const analysis = await createAnalysis({ seedUrl: 'https://example.cz/narrative-fail', seedHeadline: 'x' })
    const dimensions = { agreement: [], contradiction: [], uniqueReporting: [], framing: [] }
    await completeAnalysisWithSynthesis(analysis.id, dimensions, 'Generated headline', null, 'PARTIAL')

    await markNarrativeGenerationFailed(analysis.id)

    const found = await findSynthesisResultByAnalysisId(analysis.id)
    expect(found?.narrativeGenerationFailedAt).toBeInstanceOf(Date)
    expect(found?.narrative).toBeNull()
    expect(found?.dimensions).toEqual(dimensions)
    expect(found?.headline).toBe('Generated headline')
  })

  it('a fresh SynthesisResult has a null narrativeGenerationFailedAt', async () => {
    const analysis = await createAnalysis({
      seedUrl: 'https://example.cz/narrative-fresh',
      seedHeadline: 'x',
    })
    const dimensions = { agreement: [], contradiction: [], uniqueReporting: [], framing: [] }
    await completeAnalysisWithSynthesis(analysis.id, dimensions, null, null, 'PARTIAL')

    const found = await findSynthesisResultByAnalysisId(analysis.id)

    expect(found?.narrativeGenerationFailedAt).toBeNull()
  })
})
