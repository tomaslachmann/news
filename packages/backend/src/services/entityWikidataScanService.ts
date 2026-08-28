import type { FastifyBaseLogger } from 'fastify'
import type { WikidataSuggestionCandidate } from '@news-triangulator/shared'
import type { NewAdminActionLog } from '../repositories/adminActionLog.js'
import type { ScanEntity } from '../repositories/entityWikidataSuggestion.js'
import { evaluateAutoLink, scoreCandidate, type WikidataItemDetail } from './entityWikidataMatching.js'
import { ReconcileUnavailableError, type ReconcileTopCandidate } from './wikidataReconcileClient.js'
import type { EntityType } from '../repositories/entity.js'

// Orchestrates the semi-automated Wikidata linker (ticket 93 / ADR 0042). Runs from the scheduled
// `entity.wikidata.scan` job. Per unlinked entity: gather cheap candidates (cswiki-title resolution
// + type-constrained CirrusSearch), score them, and either auto-link (deterministic six-condition
// gate + a matching reconciliation-service opinion) or drop a ranked suggestion into the admin
// queue. No LLM anywhere — every signal is mechanical (research §8.2).

/** The `AdminActionLog.actorId` recorded for an auto-link — distinguishes it from an Admin's
 *  `entity.wikidata_linked` in the audit trail. */
export const AUTO_WIKIDATA_ACTOR = 'system:auto-wikidata'

/** Only entities mentioned in at least this many stories are scanned — below it the name signal is
 *  too thin to be worth the Wikidata calls. Tunable via env, same convention as MATCH_THRESHOLD. */
export const WIKIDATA_SCAN_MIN_STORY_COUNT = Number(process.env.WIKIDATA_SCAN_MIN_STORY_COUNT) || 2
/** Per-run entity cap — keeps one scheduled run's Wikidata call volume polite (research §5); the
 *  rest roll to the next run and are logged. */
export const WIKIDATA_SCAN_MAX_PER_RUN = Number(process.env.WIKIDATA_SCAN_MAX_PER_RUN) || 25
/** A suggestion older than this is re-scanned (candidates/data on Wikidata move). */
export const WIKIDATA_SUGGESTION_TTL_DAYS = Number(process.env.WIKIDATA_SUGGESTION_TTL_DAYS) || 14
/** Cap on candidates persisted per suggestion — the admin only needs the plausible few. */
export const SUGGESTION_MAX_CANDIDATES = 8

const DAY_MS = 24 * 60 * 60 * 1000

export interface EntityWikidataScanDeps {
  findUnlinkedEntitiesForScan: (params: {
    minStoryCount: number
    suggestionStaleBefore: Date
    limit: number
  }) => Promise<ScanEntity[]>
  countUnlinkedEntitiesForScan: (params: {
    minStoryCount: number
    suggestionStaleBefore: Date
  }) => Promise<number>
  findRejectedQidsByEntity: (entityId: string) => Promise<string[]>
  upsertSuggestion: (entityId: string, candidates: WikidataSuggestionCandidate[]) => Promise<void>
  deleteSuggestion: (entityId: string) => Promise<void>
  setEntityWikidataId: (entityId: string, wikidataId: string) => Promise<void>
  recordAdminAction: (data: NewAdminActionLog) => Promise<void>
  enqueueImageEnrich: (entityId: string) => Promise<void>
  resolveByCswikiTitle: (title: string) => Promise<WikidataItemDetail | null>
  searchTypedCandidates: (name: string, type: EntityType) => Promise<string[]>
  fetchItemDetails: (qids: string[]) => Promise<WikidataItemDetail[]>
  reconcile: (query: string, entityType: EntityType) => Promise<ReconcileTopCandidate | null>
}

export interface EntityWikidataScanResult {
  scanned: number
  autoLinked: number
  queued: number
  skipped: number
  remaining: number
}

type EntityOutcome = 'auto-linked' | 'queued' | 'skipped'

async function processEntity(
  entity: ScanEntity,
  deps: EntityWikidataScanDeps,
  log?: FastifyBaseLogger
): Promise<EntityOutcome> {
  const rejectedQids = new Set(await deps.findRejectedQidsByEntity(entity.id))

  // Serial, not parallel — polite one-at-a-time Wikidata access (research §5).
  const cswikiItem = await deps.resolveByCswikiTitle(entity.canonicalName)
  const typedQids = await deps.searchTypedCandidates(entity.canonicalName, entity.type)

  const primary = cswikiItem && !rejectedQids.has(cswikiItem.qid) ? cswikiItem : null
  const extraQids = typedQids.filter((q) => q !== primary?.qid && !rejectedQids.has(q))
  const fetched = extraQids.length > 0 ? await deps.fetchItemDetails(extraQids) : []

  const details: WikidataItemDetail[] = [...(primary ? [primary] : []), ...fetched]
  if (details.length === 0) {
    // Nothing left to offer (all candidates rejected, or no candidates at all) — clear any stale
    // suggestion so the queue doesn't keep showing a dead entry.
    await deps.deleteSuggestion(entity.id)
    return 'skipped'
  }

  const assessed = details
    .map((detail) => ({ detail, assessment: scoreCandidate(detail, entity.type, entity.canonicalName) }))
    .sort((a, b) => b.assessment.score - a.assessment.score)

  // The gate's "primary candidate" is the cswiki-resolved item, or the top-scored hit when there
  // was no cswiki page at that exact title (research §8.1).
  const primaryForGate = primary ?? assessed[0]?.detail
  if (primaryForGate) {
    const verdict = evaluateAutoLink({
      primary: primaryForGate,
      rivals: details,
      entityType: entity.type,
      canonicalName: entity.canonicalName,
    })
    if (verdict.pass && (await reconciliationAgrees(entity, primaryForGate.qid, deps, log))) {
      await deps.setEntityWikidataId(entity.id, primaryForGate.qid)
      await deps.recordAdminAction({
        actorId: AUTO_WIKIDATA_ACTOR,
        action: 'entity.wikidata_autolinked',
        targetType: 'entity',
        targetId: entity.id,
      })
      await deps.deleteSuggestion(entity.id)
      await deps.enqueueImageEnrich(entity.id)
      log?.info({ entityKey: entity.key, qid: primaryForGate.qid }, 'entity.wikidata.scan: auto-linked')
      return 'auto-linked'
    }
  }

  const candidates: WikidataSuggestionCandidate[] = assessed
    .filter(({ assessment }) => !assessment.isWikimediaInternal)
    .slice(0, SUGGESTION_MAX_CANDIDATES)
    .map(({ detail, assessment }) => ({
      qid: detail.qid,
      label: detail.label,
      description: detail.description ?? undefined,
      score: assessment.score,
      reasons: assessment.reasons,
    }))

  if (candidates.length === 0) {
    await deps.deleteSuggestion(entity.id)
    return 'skipped'
  }

  await deps.upsertSuggestion(entity.id, candidates)
  return 'queued'
}

/** True iff the reconciliation service independently names `qid` as its top match (`match: true`).
 *  A ReconcileUnavailableError (429 / timeout / non-OK — the service is volunteer-run) is treated
 *  as "no opinion" → not agreement → the entity goes to the admin queue, never auto-linked on our
 *  gate alone. */
async function reconciliationAgrees(
  entity: ScanEntity,
  qid: string,
  deps: EntityWikidataScanDeps,
  log?: FastifyBaseLogger
): Promise<boolean> {
  try {
    const top = await deps.reconcile(entity.canonicalName, entity.type)
    return top != null && top.qid === qid && top.match
  } catch (err) {
    if (err instanceof ReconcileUnavailableError) {
      log?.info(
        { entityKey: entity.key },
        'entity.wikidata.scan: reconciliation unavailable, routing to admin queue'
      )
      return false
    }
    throw err
  }
}

export async function runEntityWikidataScan(
  deps: EntityWikidataScanDeps,
  log?: FastifyBaseLogger
): Promise<EntityWikidataScanResult> {
  const suggestionStaleBefore = new Date(Date.now() - WIKIDATA_SUGGESTION_TTL_DAYS * DAY_MS)
  const filter = { minStoryCount: WIKIDATA_SCAN_MIN_STORY_COUNT, suggestionStaleBefore }

  const [entities, total] = await Promise.all([
    deps.findUnlinkedEntitiesForScan({ ...filter, limit: WIKIDATA_SCAN_MAX_PER_RUN }),
    deps.countUnlinkedEntitiesForScan(filter),
  ])

  let autoLinked = 0
  let queued = 0
  let skipped = 0
  for (const entity of entities) {
    try {
      const outcome = await processEntity(entity, deps, log)
      if (outcome === 'auto-linked') autoLinked++
      else if (outcome === 'queued') queued++
      else skipped++
    } catch (err) {
      // One entity's Wikidata call failing must not abort the run — it is retried next scan.
      skipped++
      log?.warn({ entityKey: entity.key, err }, 'entity.wikidata.scan: entity failed, continuing')
    }
  }

  const remaining = Math.max(0, total - entities.length)
  log?.info(
    { scanned: entities.length, autoLinked, queued, skipped, remaining },
    'entity.wikidata.scan: run complete'
  )
  return { scanned: entities.length, autoLinked, queued, skipped, remaining }
}
