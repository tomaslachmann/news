import type { FastifyBaseLogger } from 'fastify'
import { runEntityWikidataScan, type EntityWikidataScanDeps } from '../services/entityWikidataScanService.js'
import { JobName, type JobPayload } from './jobDefinitions.js'

/** Handler for the scheduled `entity.wikidata.scan` job (ticket 93 / ADR 0042). No payload — the
 *  service re-derives its work-list from the DB every run and is capped per run, so a retry or an
 *  overlapping redelivery just recomputes (the singleton schedule key already prevents concurrent
 *  runs). All the real logic — candidate gather, scoring, the six-condition auto-link gate, the
 *  reconciliation cross-check, the suggestion upsert — lives in `entityWikidataScanService.ts`
 *  behind an injectable deps object; this file only wires the concrete implementations. */
export async function runEntityWikidataScanJob(
  _payload: JobPayload[typeof JobName.EntityWikidataScan],
  deps: EntityWikidataScanDeps,
  log?: FastifyBaseLogger
): Promise<void> {
  await runEntityWikidataScan(deps, log)
}
