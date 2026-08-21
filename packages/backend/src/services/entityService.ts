import type { EntityDetail, EntitySearchResultItem } from '@news-triangulator/shared'
import { DEFAULT_PAGE_SIZE } from '@news-triangulator/shared'
import { NotFoundError, ValidationError } from '../errors.js'
import { fetchPage } from '../pagination.js'
import * as entityRepo from '../repositories/entity.js'
import { toEntitySearchResultItem, toEntityEventItem, toEntityDetail } from '../mappers/entity.js'

// Implementation-time tunable, same convention as ENTITY_ALIAS_CANDIDATE_LIMIT
// (repositories/entityAlias.ts) — not exposed as a query param since the ticket's search entry
// point is a simple name lookup, not a paginated list.
const ENTITY_SEARCH_RESULT_LIMIT = 20

/** Reader-facing entity search by name (ticket 42) — public, no auth. */
export async function searchEntities(query: string): Promise<EntitySearchResultItem[]> {
  if (!query.trim()) throw new ValidationError('Zadejte hledaný výraz')

  const rows = await entityRepo.searchEntitiesByName(query, ENTITY_SEARCH_RESULT_LIMIT)
  return rows.map(toEntitySearchResultItem)
}

/** Reader-facing entity detail (ticket 42) — public, no auth: canonical name/type/Wikidata link,
 *  every mentioning Event (paginated), and every entity-relation it participates in, each
 *  attributed to its asserting Event. Degrades gracefully when tickets 40/41 haven't shipped or
 *  haven't linked this entity — `wikidataId` is simply `null`, never a broken section. */
export async function getEntityDetail(
  entityKey: string,
  cursor: string | undefined,
  limit: number = DEFAULT_PAGE_SIZE
): Promise<EntityDetail> {
  const entity = await entityRepo.findEntityByKey(entityKey)
  if (!entity) throw new NotFoundError('Entita nenalezena')

  // Independent reads, run concurrently — same convention as getAnalysisDetail's
  // publishedRelations/thread fetch (analysisService.ts).
  const [{ items, nextCursor }, relationRows] = await Promise.all([
    fetchPage(cursor, limit, (decoded, boundedLimit) =>
      entityRepo.findEventsForEntity(entityKey, decoded, boundedLimit)
    ),
    entityRepo.findRelationsForEntity(entityKey),
  ])

  return toEntityDetail(entity, { items: items.map(toEntityEventItem), nextCursor }, relationRows)
}
