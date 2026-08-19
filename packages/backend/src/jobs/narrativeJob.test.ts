import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ExternalServiceError } from '../errors.js'

const { mockRunNarrativePass } = vi.hoisted(() => ({
  mockRunNarrativePass: vi.fn(),
}))

vi.mock('../services/narrativePass.js', () => ({
  runNarrativePass: mockRunNarrativePass,
}))

import { runNarrativeJob, buildNarrativeSources } from './narrativeJob.js'

const DIMENSIONS = { agreement: [], contradiction: [], uniqueReporting: [], framing: [] }

const OK_COVERAGE = {
  status: 'OK' as const,
  extractedText: 'Plný text článku.',
  source: { name: 'iDnes' },
  articleUrl: 'https://idnes.cz/x',
}

function analysis(overrides: Partial<{ coverages: unknown[]; synthesisResult: unknown }> = {}) {
  return {
    id: 'a1',
    storyId: 's1',
    coverages: [OK_COVERAGE],
    synthesisResult: { analysisId: 'a1', dimensions: DIMENSIONS, narrative: null },
    ...overrides,
  }
}

describe('buildNarrativeSources', () => {
  it('includes only OK Coverage with extractedText', () => {
    const sources = buildNarrativeSources([
      OK_COVERAGE,
      { status: 'EXTRACTION_FAILED' as const, extractedText: null, source: { name: 'X' }, articleUrl: 'u' },
      { status: 'OK' as const, extractedText: null, source: { name: 'Y' }, articleUrl: 'u2' },
    ])
    expect(sources).toEqual([
      { outlet: 'iDnes', articleUrl: 'https://idnes.cz/x', fullText: 'Plný text článku.' },
    ])
  })
})

describe('runNarrativeJob', () => {
  beforeEach(() => vi.resetAllMocks())

  const baseDeps = {
    updateSynthesisResultNarrative: vi.fn(),
    markNarrativeGenerationFailedSafe: vi.fn(),
  }

  it('logs and returns without generating when the Analysis no longer exists', async () => {
    const findAnalysisWithDetails = vi.fn().mockResolvedValue(null)
    const log = { warn: vi.fn(), error: vi.fn() }

    await runNarrativeJob({ analysisId: 'gone' }, { ...baseDeps, findAnalysisWithDetails }, log as never)

    expect(mockRunNarrativePass).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ analysisId: 'gone' }), expect.any(String))
  })

  it('logs and returns without generating when the Analysis has no SynthesisResult', async () => {
    const findAnalysisWithDetails = vi.fn().mockResolvedValue(analysis({ synthesisResult: null }))
    const log = { warn: vi.fn(), error: vi.fn() }

    await runNarrativeJob({ analysisId: 'a1' }, { ...baseDeps, findAnalysisWithDetails }, log as never)

    expect(mockRunNarrativePass).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalled()
  })

  it('logs and returns without generating when there is no eligible source text', async () => {
    const findAnalysisWithDetails = vi.fn().mockResolvedValue(analysis({ coverages: [] }))
    const log = { warn: vi.fn(), error: vi.fn() }

    await runNarrativeJob({ analysisId: 'a1' }, { ...baseDeps, findAnalysisWithDetails }, log as never)

    expect(mockRunNarrativePass).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalled()
  })

  it('logs and returns without regenerating when a narrative is already present (redelivered job)', async () => {
    const findAnalysisWithDetails = vi.fn().mockResolvedValue(
      analysis({
        synthesisResult: {
          analysisId: 'a1',
          dimensions: DIMENSIONS,
          narrative: [{ prose: 'already there', attributions: [] }],
        },
      })
    )
    const log = { warn: vi.fn(), error: vi.fn() }

    await runNarrativeJob({ analysisId: 'a1' }, { ...baseDeps, findAnalysisWithDetails }, log as never)

    expect(mockRunNarrativePass).not.toHaveBeenCalled()
    expect(baseDeps.updateSynthesisResultNarrative).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalled()
  })

  it('generates and persists the narrative from Coverage text and cached Dimensions', async () => {
    const findAnalysisWithDetails = vi.fn().mockResolvedValue(analysis())
    const segments = [
      {
        prose: 'Kombinovaná zpráva.',
        attributions: [{ outlet: 'iDnes', czechQuote: 'Q', articleUrl: 'https://idnes.cz/x' }],
      },
    ]
    mockRunNarrativePass.mockResolvedValue({ segments })

    await runNarrativeJob({ analysisId: 'a1' }, { ...baseDeps, findAnalysisWithDetails })

    expect(mockRunNarrativePass).toHaveBeenCalledWith(
      [{ outlet: 'iDnes', articleUrl: 'https://idnes.cz/x', fullText: 'Plný text článku.' }],
      DIMENSIONS,
      undefined
    )
    expect(baseDeps.updateSynthesisResultNarrative).toHaveBeenCalledWith('a1', segments)
    expect(baseDeps.markNarrativeGenerationFailedSafe).not.toHaveBeenCalled()
  })

  it('marks the failure and rethrows as retryable when generation throws', async () => {
    const findAnalysisWithDetails = vi.fn().mockResolvedValue(analysis())
    mockRunNarrativePass.mockRejectedValue(new Error('LLM down'))

    await expect(
      runNarrativeJob({ analysisId: 'a1' }, { ...baseDeps, findAnalysisWithDetails })
    ).rejects.toThrow(ExternalServiceError)

    expect(baseDeps.markNarrativeGenerationFailedSafe).toHaveBeenCalledWith('a1')
    expect(baseDeps.updateSynthesisResultNarrative).not.toHaveBeenCalled()
  })

  it('does not cache an empty narrative result, logging and marking it a retryable failure instead', async () => {
    const findAnalysisWithDetails = vi.fn().mockResolvedValue(analysis())
    mockRunNarrativePass.mockResolvedValue({ segments: [] })
    const log = { warn: vi.fn(), error: vi.fn() }

    await expect(
      runNarrativeJob({ analysisId: 'a1' }, { ...baseDeps, findAnalysisWithDetails }, log as never)
    ).rejects.toThrow(ExternalServiceError)

    expect(baseDeps.updateSynthesisResultNarrative).not.toHaveBeenCalled()
    expect(baseDeps.markNarrativeGenerationFailedSafe).toHaveBeenCalledWith('a1')
    expect(log.error).toHaveBeenCalledWith({ analysisId: 'a1' }, expect.any(String))
  })

  it('marks the failure and rethrows as retryable when persisting the generated narrative fails', async () => {
    const findAnalysisWithDetails = vi.fn().mockResolvedValue(analysis())
    const segments = [
      { prose: 'x', attributions: [{ outlet: 'iDnes', czechQuote: 'Q', articleUrl: 'https://idnes.cz/x' }] },
    ]
    mockRunNarrativePass.mockResolvedValue({ segments })
    const updateSynthesisResultNarrative = vi.fn().mockRejectedValue(new Error('DB down'))

    await expect(
      runNarrativeJob(
        { analysisId: 'a1' },
        { ...baseDeps, findAnalysisWithDetails, updateSynthesisResultNarrative }
      )
    ).rejects.toThrow(ExternalServiceError)

    expect(baseDeps.markNarrativeGenerationFailedSafe).toHaveBeenCalledWith('a1')
  })
})
