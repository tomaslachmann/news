import type { FastifyBaseLogger } from 'fastify'
import type { AnalysisDimensions, SseEvent } from '@news-triangulator/shared'
import { NotFoundError } from '../errors.js'
import * as analysisRepo from '../repositories/analysis.js'
import * as coverageRepo from '../repositories/coverage.js'
import * as synthesisRepo from '../repositories/synthesisResult.js'
import { toCoverageInfo } from '../mappers/coverage.js'
import { runExtractionPass, ExtractionResultSchema } from './extractionPass.js'
import { runSynthesisPass, type SourceExtraction } from './synthesisPass.js'
import { runHeadlinePass } from './headlinePass.js'
import type { Coverage } from '../repositories/coverage.js'

export interface RunAnalysisStreamOptions {
  /** Called once the Analysis is confirmed to exist, right before the first `send`. */
  onReady: () => void
  send: (event: SseEvent) => void
  /** Registers a handler to invoke if the client disconnects before the pipeline finishes. */
  onClientClose: (handler: () => void) => void
  log?: FastifyBaseLogger
}

export async function runAnalysisStream(
  analysisId: string,
  { onReady, send, onClientClose, log }: RunAnalysisStreamOptions
): Promise<void> {
  const analysis = await analysisRepo.findAnalysisById(analysisId)
  if (!analysis) throw new NotFoundError('Analýza nenalezena')

  onReady()

  const coverages = await coverageRepo.findCoveragesForAnalysis(analysisId)
  send({ type: 'sources-confirmed', coverages: coverages.map(toCoverageInfo) })

  const extractable = coverages.filter((c) => c.status === 'OK')
  const unavailable = coverages.filter((c) => c.status !== 'OK')
  for (const c of unavailable) {
    send({
      type: 'extraction-error',
      coverageId: c.id,
      outlet: c.outlet,
      error: 'Text článku není k dispozici',
    })
  }

  // Resolve early if the client disconnects; the pipeline keeps running in the background
  // regardless, since `send` safely no-ops once the connection is closed.
  await new Promise<void>((resolve) => {
    onClientClose(resolve)
    void runExtractionAndSynthesis(analysisId, coverages, extractable, send, log).then(resolve)
  })
}

async function runExtractionAndSynthesis(
  analysisId: string,
  allCoverages: Coverage[],
  extractable: Coverage[],
  send: (event: SseEvent) => void,
  log?: FastifyBaseLogger
): Promise<void> {
  await Promise.allSettled(
    extractable.map(async (coverage) => {
      // Already extracted in a previous stream session — re-emit the complete event
      if (coverage.extractionResult) {
        const result = ExtractionResultSchema.safeParse(coverage.extractionResult)
        if (result.success) {
          send({
            type: 'extraction-complete',
            coverageId: coverage.id,
            outlet: coverage.outlet,
            claimCount: result.data.factualClaims.length,
            attributedClaimCount: result.data.attributedClaims.length,
            framingSignalCount: result.data.framingSignals.length,
          })
          return
        }
      }

      try {
        const extraction = await runExtractionPass(coverage.extractedText!, log)
        await coverageRepo.updateCoverage(coverage.id, { extractionResult: extraction })
        send({
          type: 'extraction-complete',
          coverageId: coverage.id,
          outlet: coverage.outlet,
          claimCount: extraction.factualClaims.length,
          attributedClaimCount: extraction.attributedClaims.length,
          framingSignalCount: extraction.framingSignals.length,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Extrakce se nezdařila'
        send({ type: 'extraction-error', coverageId: coverage.id, outlet: coverage.outlet, error: message })
      }
    })
  )

  send({ type: 'extraction-settled' })

  // Re-use cached synthesis result if the stream is reconnected
  const cached = await synthesisRepo.findSynthesisResultByAnalysisId(analysisId)
  if (cached) {
    send({ type: 'synthesis-complete', dimensions: cached.dimensions as unknown as AnalysisDimensions })
    return
  }

  // Build source list from coverages that have a validated extraction result
  const extracted = await coverageRepo.findCoveragesForAnalysis(analysisId, { onlyStatus: 'OK' })

  let droppedCount = 0
  const sources: SourceExtraction[] = []
  for (const c of extracted) {
    const parsed = ExtractionResultSchema.safeParse(c.extractionResult)
    if (parsed.success) {
      sources.push({
        outlet: c.outlet,
        articleUrl: c.articleUrl,
        extraction: parsed.data,
        extractedText: c.extractedText!,
      })
    } else {
      droppedCount++
      log?.warn(
        { coverageId: c.id },
        'Coverage extractionResult failed schema validation; excluding from synthesis'
      )
    }
  }

  const excludedCount = allCoverages.filter((c) => c.status !== 'OK').length + droppedCount

  if (sources.length === 0) {
    send({ type: 'synthesis-error', error: 'Žádné úspěšné extrakce k syntéze' })
    await analysisRepo.updateAnalysisStatus(analysisId, 'FAILED')
    return
  }

  try {
    const synthesis = await runSynthesisPass(sources, excludedCount, log)
    // A failed headline generation is caught by this same try/catch — the Analysis must not
    // reach COMPLETE without a headline, so this isn't allowed to degrade separately from
    // Synthesis's own failure handling (see ADR 0021).
    const headline = await runHeadlinePass(synthesis.agreement, log)
    await analysisRepo.completeAnalysisWithSynthesis(analysisId, synthesis, headline)
    send({ type: 'synthesis-complete', dimensions: synthesis })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Syntéza se nezdařila'
    send({ type: 'synthesis-error', error: message })
    await analysisRepo.updateAnalysisStatus(analysisId, 'FAILED').catch(() => {})
  }
}
