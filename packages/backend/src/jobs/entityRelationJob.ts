import type { FastifyBaseLogger } from 'fastify'
import {
  extractEntitiesAndLinkStoryRelations,
  type EntityAndRelationPipelineDeps,
  type StoryForRelationPipeline,
} from '../services/storyRelationPass.js'
import type { AnalysisWithStory } from '../repositories/analysis.js'
import type { CoverageWithSource } from '../repositories/coverage.js'
import { JobName, type JobPayload } from './jobDefinitions.js'

export interface EntityRelationJobDeps extends EntityAndRelationPipelineDeps {
  findAnalysisWithStory: (analysisId: string) => Promise<AnalysisWithStory | null>
  findCoveragesForAnalysis: (analysisId: string) => Promise<CoverageWithSource[]>
}

/** Same rule for both trigger points, computed from current Coverage DB state rather than a
 *  payload snapshot (safe to re-derive on a `pg-boss` retry): use `extractedText` if present;
 *  else fall back to `title` unless this Coverage's extraction is known to have failed. This
 *  reproduces `approveDraft`'s "verified titles" (Ingestion-created Coverage sits at
 *  `status: PENDING` with only a title) and `confirmCoverages`'s "OK extractedText, everything
 *  else excluded" exactly, without either call site needing its own bespoke selection — see
 *  .scratch/backend-audit/issues/14-entity-relation-job.md. `anchorHeadline` is prepended only
 *  for the draft-approval flow, preserving today's asymmetry rather than changing what feeds
 *  extraction. */
export function deriveSourceTexts(
  coverages: Pick<CoverageWithSource, 'title' | 'extractedText' | 'status'>[],
  story: Pick<StoryForRelationPipeline, 'anchorHeadline'>,
  origin: JobPayload[typeof JobName.EntityRelation]['origin']
): string[] {
  const coverageTexts = coverages
    .map((c) => c.extractedText ?? (c.status === 'EXTRACTION_FAILED' ? null : c.title))
    .filter((text): text is string => Boolean(text))
  return origin === 'draft-approval' ? [story.anchorHeadline, ...coverageTexts] : coverageTexts
}

/** Handler for the `entity.extract` job (ticket 14): looks up the Analysis this job's `analysisId`
 *  points to, derives source text from current Coverage state, then runs the same
 *  extraction+relation-linking pipeline `approveDraft`/`confirmCoverages` used to run inline. The
 *  Analysis no longer existing is a permanent condition — retrying a lookup that will never
 *  resolve wastes the job's retry budget for nothing, so it's logged and swallowed rather than
 *  thrown. Every other failure this pipeline can hit is retryable and left to propagate (see
 *  extractEntitiesAndLinkStoryRelations). */
export async function runEntityRelationJob(
  payload: JobPayload[typeof JobName.EntityRelation],
  deps: EntityRelationJobDeps,
  log?: FastifyBaseLogger
): Promise<void> {
  // Run together, not sequentially — findCoveragesForAnalysis only needs payload.analysisId, not
  // the Analysis lookup's result, so there's no reason to serialize them on the common
  // (Analysis-exists) path. The rare not-found path pays for a Coverage query it then discards.
  const [analysis, coverages] = await Promise.all([
    deps.findAnalysisWithStory(payload.analysisId),
    deps.findCoveragesForAnalysis(payload.analysisId),
  ])
  if (!analysis) {
    log?.warn({ analysisId: payload.analysisId }, 'entity.extract job: Analysis no longer exists, skipping')
    return
  }

  const sourceTexts = deriveSourceTexts(coverages, analysis.story, payload.origin)

  await extractEntitiesAndLinkStoryRelations(analysis.storyId, sourceTexts, analysis.story, deps, log)
}
