import type { FastifyBaseLogger } from 'fastify'
import { ExternalServiceError } from '../errors.js'

/** Shared by every stage of the `entity.extract` job pipeline (entityExtractionPass.ts,
 *  storyRelationPass.ts): run `run`, and on failure log with `stage` context and rethrow as
 *  `ExternalServiceError` (with the original error preserved via `cause`) instead of swallowing
 *  it. Swallowing here would make `pg-boss`'s retry policy for this job dead code — see
 *  .scratch/backend-audit/issues/14-entity-relation-job.md. */
export async function runStageOrThrow<T>(
  storyId: string,
  stage: string,
  log: FastifyBaseLogger | undefined,
  run: () => Promise<T>
): Promise<T> {
  try {
    return await run()
  } catch (err) {
    log?.error({ storyId, err }, `${stage} failed`)
    throw new ExternalServiceError(`${stage} failed for Story ${storyId}`, { cause: err })
  }
}
