import type { FastifyBaseLogger } from 'fastify'
import { ExternalServiceError } from '../errors.js'

/** Shared by every stage of the job-queue pipelines that call it (entityExtractionPass.ts,
 *  storyRelationPass.ts for `entity.extract`; narrativeJob.ts for `narrative.generate`): run
 *  `run`, and on failure log with `stage` context and rethrow as `ExternalServiceError` (with the
 *  original error preserved via `cause`) instead of swallowing it. Swallowing here would make
 *  `pg-boss`'s retry policy for the calling job dead code — see
 *  .scratch/backend-audit/issues/14-entity-relation-job.md. `logContext` is spread directly into
 *  the log call and rendered into the thrown message as `key=value` pairs — pass whatever
 *  identifies the unit of work to the caller (e.g. `{ storyId }`, `{ analysisId }`). */
export async function runStageOrThrow<T>(
  logContext: Record<string, string>,
  stage: string,
  log: FastifyBaseLogger | undefined,
  run: () => Promise<T>
): Promise<T> {
  try {
    return await run()
  } catch (err) {
    log?.error({ ...logContext, err }, `${stage} failed`)
    const subject = Object.entries(logContext)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ')
    throw new ExternalServiceError(`${stage} failed (${subject})`, { cause: err })
  }
}
