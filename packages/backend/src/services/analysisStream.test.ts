import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as analysisRepo from '../repositories/analysis.js'
import * as coverageRepo from '../repositories/coverage.js'
import * as synthesisRepo from '../repositories/synthesisResult.js'
import * as extractionPassModule from './extractionPass.js'
import * as synthesisPassModule from './synthesisPass.js'
import { runAnalysisStream } from './analysisStream.js'
import { NotFoundError } from '../errors.js'
import type { SseEvent } from '@news-triangulator/shared'

vi.mock('../repositories/analysis.js')
vi.mock('../repositories/coverage.js')
vi.mock('../repositories/synthesisResult.js')
vi.mock('./extractionPass.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./extractionPass.js')>()
  return { ...actual, runExtractionPass: vi.fn() }
})
vi.mock('./synthesisPass.js')

const ANALYSIS = {
  id: 'a1',
  seedUrl: 'x',
  seedHeadline: 'x',
  status: 'PENDING' as const,
  createdAt: new Date(),
}

const VALID_EXTRACTION = {
  factualClaims: [{ claim: 'x', czechQuote: 'x' }],
  attributedClaims: [],
  interpretiveStatements: [],
  framingSignals: [],
}

const BASE_COVERAGE = {
  id: 'c1',
  analysisId: 'a1',
  outlet: 'iDnes',
  title: null,
  articleUrl: 'https://idnes.cz/x',
  publishedAt: null,
  extractedText: 'text',
  status: 'OK' as const,
  excluded: false,
}

describe('runAnalysisStream', () => {
  beforeEach(() => vi.resetAllMocks())

  it('throws NotFoundError before calling onReady when the Analysis does not exist', async () => {
    vi.mocked(analysisRepo.findAnalysisById).mockResolvedValue(null)
    const onReady = vi.fn()
    const send = vi.fn()

    await expect(runAnalysisStream('missing', { onReady, send, onClientClose: () => {} })).rejects.toThrow(
      NotFoundError
    )
    expect(onReady).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('runs extraction then synthesis, emitting events in order, for a full successful pass', async () => {
    vi.mocked(analysisRepo.findAnalysisById).mockResolvedValue(ANALYSIS)
    vi.mocked(coverageRepo.findCoveragesForAnalysis).mockImplementation((_id, opts) =>
      Promise.resolve(
        opts?.onlyStatus === 'OK'
          ? [{ ...BASE_COVERAGE, extractionResult: VALID_EXTRACTION }]
          : [{ ...BASE_COVERAGE, extractionResult: null }]
      )
    )
    vi.mocked(synthesisRepo.findSynthesisResultByAnalysisId).mockResolvedValue(null)
    vi.mocked(extractionPassModule.runExtractionPass).mockResolvedValue(VALID_EXTRACTION)
    vi.mocked(synthesisPassModule.runSynthesisPass).mockResolvedValue({
      agreement: [],
      contradiction: [],
      uniqueReporting: [],
      framing: [],
    })

    const onReady = vi.fn()
    const events: SseEvent['type'][] = []
    const send = vi.fn((event: SseEvent) => events.push(event.type))

    await runAnalysisStream('a1', { onReady, send, onClientClose: () => {} })

    expect(onReady).toHaveBeenCalledOnce()
    expect(events).toEqual([
      'sources-confirmed',
      'extraction-complete',
      'extraction-settled',
      'synthesis-complete',
    ])
    expect(analysisRepo.completeAnalysisWithSynthesis).toHaveBeenCalledWith('a1', {
      agreement: [],
      contradiction: [],
      uniqueReporting: [],
      framing: [],
    })
  })

  it('emits synthesis-error and marks the Analysis failed when no coverage extracted successfully', async () => {
    vi.mocked(analysisRepo.findAnalysisById).mockResolvedValue(ANALYSIS)
    vi.mocked(coverageRepo.findCoveragesForAnalysis).mockResolvedValue([])
    vi.mocked(synthesisRepo.findSynthesisResultByAnalysisId).mockResolvedValue(null)

    const events: SseEvent['type'][] = []
    const send = vi.fn((event: SseEvent) => events.push(event.type))

    await runAnalysisStream('a1', { onReady: vi.fn(), send, onClientClose: () => {} })

    expect(events).toEqual(['sources-confirmed', 'extraction-settled', 'synthesis-error'])
    expect(analysisRepo.updateAnalysisStatus).toHaveBeenCalledWith('a1', 'FAILED')
    expect(synthesisPassModule.runSynthesisPass).not.toHaveBeenCalled()
  })

  it('resolves as soon as the client disconnects, without waiting for the pipeline', async () => {
    vi.mocked(analysisRepo.findAnalysisById).mockResolvedValue(ANALYSIS)
    vi.mocked(coverageRepo.findCoveragesForAnalysis).mockResolvedValue([
      { ...BASE_COVERAGE, extractionResult: null },
    ])
    vi.mocked(synthesisRepo.findSynthesisResultByAnalysisId).mockResolvedValue(null)
    // Never resolves — if runAnalysisStream waited on this, the test itself would hang/time out
    vi.mocked(extractionPassModule.runExtractionPass).mockReturnValue(new Promise(() => {}))

    let closeHandler: (() => void) | undefined
    const onClientClose = (handler: () => void) => {
      closeHandler = handler
    }
    const send = vi.fn()

    const promise = runAnalysisStream('a1', { onReady: vi.fn(), send, onClientClose })
    await vi.waitFor(() => {
      if (!closeHandler) throw new Error('onClientClose handler not registered yet')
    })
    closeHandler!()

    await expect(promise).resolves.toBeUndefined()
  })
})
