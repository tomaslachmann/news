import type { EntityWikidataSuggestionItem, WikidataCandidateItem } from '@news-triangulator/shared'
import { NotFoundError, ValidationError } from '../errors.js'
import * as entityRepo from '../repositories/entity.js'
import * as suggestionRepo from '../repositories/entityWikidataSuggestion.js'
import { recordAdminActionSafe } from '../repositories/adminActionLog.js'
import { enqueueJob } from '../jobs/enqueue.js'
import { JobName } from '../jobs/jobDefinitions.js'
import { searchWikidataEntities } from './wikidataSearchClient.js'

async function findEntityOrThrow(entityKey: string): Promise<entityRepo.EntityRecord> {
  const entity = await entityRepo.findEntityByKey(entityKey)
  if (!entity) throw new NotFoundError('Entita nenalezena')
  return entity
}

/** Wikidata candidates for `entityKey`'s search-and-confirm flow (ticket 41) — a thin proxy over
 *  `searchWikidataEntities`, scoped to a real Entity so a request naming a key that doesn't exist
 *  fails before ever calling out to Wikidata. */
export async function getWikidataCandidates(
  entityKey: string,
  query: string
): Promise<WikidataCandidateItem[]> {
  await findEntityOrThrow(entityKey)
  if (!query.trim()) throw new ValidationError('Zadejte hledaný výraz')
  return searchWikidataEntities(query)
}

/** Confirms `wikidataId` (an Admin-picked `WikidataCandidateItem.qid`) as `entityKey`'s Wikidata
 *  link — never an automated/unconfirmed match (docs/spec-entity-resolution.md). `entity.image.
 *  enrich` (ADR 0034) is enqueued only after this link is persisted, never inside the same write,
 *  so a slow/failing Wikimedia call can't hold up or roll back the link itself; the enqueue is
 *  best-effort (logged, not thrown) — same convention as this codebase's other non-atomic
 *  enqueue call sites (e.g. `confirmCoverages`'s `entity.extract` enqueue). */
export async function linkEntityWikidata(
  entityKey: string,
  wikidataId: string,
  actorId: string
): Promise<void> {
  const entity = await findEntityOrThrow(entityKey)
  await applyWikidataLink(entity.id, wikidataId, actorId)
}

/** Shared by the manual link (`linkEntityWikidata`) and the suggestion-queue confirm
 *  (`confirmWikidataSuggestion`): persist the link, log it, then best-effort enqueue the enrich job
 *  once the link has committed (never inside the same write — a slow Wikimedia call must not hold
 *  up or roll back the link). Both paths log `entity.wikidata_linked` — an Admin vouched for the
 *  match either way; the scan's own unattended links use `entity.wikidata_autolinked` instead. */
async function applyWikidataLink(entityId: string, wikidataId: string, actorId: string): Promise<void> {
  await entityRepo.setEntityWikidataId(entityId, wikidataId)
  await recordAdminActionSafe({
    actorId,
    action: 'entity.wikidata_linked',
    targetType: 'entity',
    targetId: entityId,
  })

  try {
    await enqueueJob(JobName.EntityImageEnrich, { entityId })
  } catch (err) {
    console.error('Failed to enqueue entity.image.enrich job after linking wikidataId', err)
  }
}

// --- Ticket 93 / ADR 0042: the scheduled scan's admin suggestion queue ------------------------

/** Every pending Wikidata-link suggestion the scheduled scan produced for the review queue — the
 *  raw repository shape already matches `EntityWikidataSuggestionItem` field for field (the
 *  `EntityType` Prisma enum and shared's `EntityTypeLabel` are the same string literals), same as
 *  `getEntityAliasCandidates`. */
export async function getWikidataSuggestions(): Promise<EntityWikidataSuggestionItem[]> {
  return suggestionRepo.listSuggestions()
}

async function loadSuggestionOrThrow(
  entityKey: string
): Promise<{ entity: entityRepo.EntityRecord; candidates: suggestionRepo.WikidataSuggestionCandidate[] }> {
  const entity = await findEntityOrThrow(entityKey)
  const candidates = await suggestionRepo.findSuggestionCandidates(entity.id)
  if (!candidates) throw new NotFoundError('Návrh na propojení nenalezen')
  return { entity, candidates }
}

/** Confirms one of the suggested candidates as the entity's Wikidata link — the same persist +
 *  log + enrich as a manual link, then the suggestion row is cleared. The Q-id must be one the
 *  scan actually offered (a stale UI or a hand-crafted request naming an arbitrary Q-id fails). */
export async function confirmWikidataSuggestion(
  entityKey: string,
  wikidataId: string,
  actorId: string
): Promise<void> {
  const { entity, candidates } = await loadSuggestionOrThrow(entityKey)
  if (!candidates.some((c) => c.qid === wikidataId)) {
    throw new ValidationError('Q-id není mezi navrženými kandidáty')
  }

  await applyWikidataLink(entity.id, wikidataId, actorId)
  await suggestionRepo.deleteSuggestion(entity.id)
}

/** Dismisses the whole suggestion — "none of these is right". Every candidate currently shown is
 *  recorded as a permanent rejection (so an identical candidate set never comes back), then the
 *  suggestion row is cleared. A genuinely new candidate on a later scan still creates a fresh
 *  suggestion. */
export async function dismissWikidataSuggestion(entityKey: string, actorId: string): Promise<void> {
  const { entity, candidates } = await loadSuggestionOrThrow(entityKey)

  for (const candidate of candidates) {
    await suggestionRepo.rejectCandidate(entity.id, candidate.qid, actorId)
  }
  await suggestionRepo.deleteSuggestion(entity.id)
  await recordAdminActionSafe({
    actorId,
    action: 'entity.wikidata_suggestion_dismissed',
    targetType: 'entity',
    targetId: entity.id,
  })
}

/** Rejects one candidate but keeps the suggestion — the Q-id is recorded as a permanent rejection
 *  and dropped from the suggestion; if it was the last one, the suggestion row is cleared. */
export async function rejectWikidataSuggestionCandidate(
  entityKey: string,
  wikidataId: string,
  actorId: string
): Promise<void> {
  const { entity, candidates } = await loadSuggestionOrThrow(entityKey)
  if (!candidates.some((c) => c.qid === wikidataId)) {
    throw new ValidationError('Q-id není mezi navrženými kandidáty')
  }

  await suggestionRepo.rejectCandidate(entity.id, wikidataId, actorId)
  const remaining = candidates.filter((c) => c.qid !== wikidataId)
  if (remaining.length > 0) await suggestionRepo.upsertSuggestion(entity.id, remaining)
  else await suggestionRepo.deleteSuggestion(entity.id)

  await recordAdminActionSafe({
    actorId,
    action: 'entity.wikidata_candidate_rejected',
    targetType: 'entity',
    targetId: entity.id,
  })
}

/** Clears a previously-confirmed Wikidata link (ticket 41) — leaves any already-fetched
 *  `EntityImage` rows in place (re-fetch/removal on unlink isn't scoped in this wave). A no-op,
 *  idempotent DELETE-style success for an entity with no link to begin with — it must not write a
 *  DB update or an `entity.wikidata_unlinked` audit row for an unlink that never actually
 *  happened. */
export async function unlinkEntityWikidata(entityKey: string, actorId: string): Promise<void> {
  const entity = await findEntityOrThrow(entityKey)
  if (!entity.wikidataId) return

  await entityRepo.clearEntityWikidataId(entity.id)
  await recordAdminActionSafe({
    actorId,
    action: 'entity.wikidata_unlinked',
    targetType: 'entity',
    targetId: entity.id,
  })
}
