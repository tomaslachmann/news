import type { FastifyBaseLogger } from 'fastify'
import type { AnalysisDimensions, SseEvent } from '@news-triangulator/shared'
import { NotFoundError } from '../errors.js'
import * as analysisRepo from '../repositories/analysis.js'
import * as coverageRepo from '../repositories/coverage.js'
import * as synthesisRepo from '../repositories/synthesisResult.js'
import { toCoverageInfo } from '../mappers/coverage.js'
import { runExtractionPass, ExtractionResultSchema } from './extractionPass.js'
import { runSynthesisPass, type SourceExtraction } from './synthesisPass.js'
import { computeSourceOverlapPercentage } from './sourceOverlap.js'
import { runHeadlinePass } from './headlinePass.js'
import type { CoverageWithSource } from '../repositories/coverage.js'
import { enqueueJob } from '../jobs/enqueue.js'
import { JobName } from '../jobs/jobDefinitions.js'
import { recordAdminActionSafe } from '../repositories/adminActionLog.js'

export interface RunAnalysisStreamOptions {
  /** Called once the Analysis is confirmed to exist, right before the first `send`. */
  onReady: () => void
  send: (event: SseEvent) => void
  /** Registers a handler to invoke if the client disconnects before the pipeline finishes. */
  onClientClose: (handler: () => void) => void
  /** The admin whose request triggered this stream — see repositories/adminActionLog.ts. */
  actorId: string
  log?: FastifyBaseLogger
}

export async function runAnalysisStream(
  analysisId: string,
  { onReady, send, onClientClose, actorId, log }: RunAnalysisStreamOptions
): Promise<void> {
  const analysis = await analysisRepo.findAnalysisById(analysisId)
  if (!analysis) throw new NotFoundError('Analýza nenalezena')

  onReady()

  // Logged at the admin's request to trigger extraction+synthesis, not at the pipeline's eventual
  // success/failure — same "log the decision, not the downstream outcome" convention every other
  // admin action here follows (see ticket 09's Answer). Awaited after onReady(), not before — this
  // write must never delay flushing the SSE response headers.
  await recordAdminActionSafe({
    actorId,
    action: 'analysis.synthesis_triggered',
    targetType: 'analysis',
    targetId: analysisId,
  })

  const coverages = await coverageRepo.findCoveragesForAnalysis(analysisId)
  send({ type: 'sources-confirmed', coverages: coverages.map(toCoverageInfo) })

  const extractable = coverages.filter((c) => c.status === 'OK')
  const unavailable = coverages.filter((c) => c.status !== 'OK')
  for (const c of unavailable) {
    send({
      type: 'extraction-error',
      coverageId: c.id,
      outlet: c.source.name,
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
  allCoverages: CoverageWithSource[],
  extractable: CoverageWithSource[],
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
            outlet: coverage.source.name,
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
          outlet: coverage.source.name,
          claimCount: extraction.factualClaims.length,
          attributedClaimCount: extraction.attributedClaims.length,
          framingSignalCount: extraction.framingSignals.length,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Extrakce se nezdařila'
        send({
          type: 'extraction-error',
          coverageId: coverage.id,
          outlet: coverage.source.name,
          error: message,
        })
      }
    })
  )

  send({ type: 'extraction-settled' })

  // Re-use cached synthesis result if the stream is reconnected. agreementCategory is merged in
  // from its own column (ticket 38 / ADR 0030), same reason as mappers/analysis.ts's
  // toAnalysisDetail — a reconnect for one of the 4 migration-backfilled Analyses would otherwise
  // re-emit `dimensions` without the field its type declares required.
  const cached = await synthesisRepo.findSynthesisResultByAnalysisId(analysisId)
  if (cached) {
    send({
      type: 'synthesis-complete',
      dimensions: {
        ...(cached.dimensions as unknown as AnalysisDimensions),
        agreementCategory: cached.agreementCategory,
      },
    })
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
        outlet: c.source.name,
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
    // Ticket 38 / ADR 0030 — counted from the just-validated `synthesis` result and the actual
    // number of sources that went into it, not the raw coverage count (which may include
    // excluded/failed ones `sources` already left out).
    const sourceOverlapPercentage = computeSourceOverlapPercentage(synthesis, sources.length)
    // narrative.generate (ticket 15, ADR 0028) is enqueued inside the same transaction as the
    // COMPLETE write — never a completed Analysis without its narrative job. A queue failure
    // rolls the whole transition back, same as this same try/catch already does for a headline
    // failure.
    await analysisRepo.completeAnalysisWithSynthesis(analysisId, synthesis, {
      headline,
      sourceOverlapPercentage,
      agreementCategory: synthesis.agreementCategory,
      onComplete: async (tx) => {
        await enqueueJob(JobName.Narrative, { analysisId }, { tx })
      },
    })
    send({ type: 'synthesis-complete', dimensions: synthesis })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Syntéza se nezdařila'
    send({ type: 'synthesis-error', error: message })
    await analysisRepo.updateAnalysisStatus(analysisId, 'FAILED').catch(() => {})
  }
}
