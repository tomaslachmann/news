import type {
  EntityDetail,
  EntityEventItem,
  EntityRelationItem,
  EntitySearchResultItem,
  Page,
} from '@news-triangulator/shared'
import type {
  EntityRecord,
  EntitySearchRow,
  EntityEventRow,
  EntityRelationForEntityRow,
} from '../repositories/entity.js'
import { resolveDisplayTitle } from './analysis.js'

export function toEntitySearchResultItem(row: EntitySearchRow): EntitySearchResultItem {
  return { key: row.key, canonicalName: row.canonicalName, type: row.type, storyCount: row.storyCount }
}

export function toEntityEventItem(row: EntityEventRow): EntityEventItem {
  return {
    analysisId: row.id,
    title: resolveDisplayTitle(row.headline, row.seedHeadline),
    createdAt: row.createdAt.toISOString(),
  }
}

/** `entityKey` decides which side of the row is "this entity" vs. `otherEntity` — a
 *  `StoryEntityRelation` doesn't itself know which of its two entities a given caller is asking
 *  about. */
export function toEntityRelationItem(row: EntityRelationForEntityRow, entityKey: string): EntityRelationItem {
  const direction = row.fromEntity.key === entityKey ? 'from' : 'to'
  const otherEntity = direction === 'from' ? row.toEntity : row.fromEntity

  return {
    id: row.id,
    type: row.type,
    direction,
    otherEntity,
    assertedBy: {
      analysisId: row.analysisId,
      title: resolveDisplayTitle(row.headline, row.seedHeadline),
    },
  }
}

export function toEntityDetail(
  entity: EntityRecord,
  events: Page<EntityEventItem>,
  relationRows: EntityRelationForEntityRow[],
  aliases: string[]
): EntityDetail {
  return {
    key: entity.key,
    canonicalName: entity.canonicalName,
    type: entity.type,
    wikidataId: entity.wikidataId,
    aliases,
    events,
    relations: relationRows.map((r) => toEntityRelationItem(r, entity.key)),
  }
}
