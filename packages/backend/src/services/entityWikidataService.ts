import type { WikidataCandidateItem } from '@news-triangulator/shared'
import { NotFoundError, ValidationError } from '../errors.js'
import * as entityRepo from '../repositories/entity.js'
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

  await entityRepo.setEntityWikidataId(entity.id, wikidataId)
  await recordAdminActionSafe({
    actorId,
    action: 'entity.wikidata_linked',
    targetType: 'entity',
    targetId: entity.id,
  })

  try {
    await enqueueJob(JobName.EntityImageEnrich, { entityId: entity.id })
  } catch (err) {
    console.error('Failed to enqueue entity.image.enrich job after linking wikidataId', err)
  }
}

/** Clears a previously-confirmed Wikidata link (ticket 41) — leaves any already-fetched
 *  `EntityImage` rows in place (re-fetch/removal on unlink isn't scoped in this wave). */
export async function unlinkEntityWikidata(entityKey: string, actorId: string): Promise<void> {
  const entity = await findEntityOrThrow(entityKey)

  await entityRepo.clearEntityWikidataId(entity.id)
  await recordAdminActionSafe({
    actorId,
    action: 'entity.wikidata_unlinked',
    targetType: 'entity',
    targetId: entity.id,
  })
}
