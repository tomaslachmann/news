import type {
  EntityCoMentionItem,
  EntityDetail,
  EntityEventItem,
  EntityMentionMonth,
  EntityRelationItem,
  EntitySearchResultItem,
  Page,
} from '@news-triangulator/shared'
import type {
  EntityRecord,
  EntitySearchRow,
  EntityEventRow,
  EntityRelationForEntityRow,
  EntityStats,
  CoMentionedEntityRow,
  MentionMonthRow,
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

function toEntityCoMentionItem(row: CoMentionedEntityRow): EntityCoMentionItem {
  return {
    key: row.key,
    canonicalName: row.canonicalName,
    type: row.type,
    sharedStoryCount: row.sharedStoryCount,
  }
}

function toEntityMentionMonth(row: MentionMonthRow): EntityMentionMonth {
  return { month: row.month, count: row.count }
}

/** Options bag rather than positional params — this field set has grown once already (ticket 90
 *  over ticket 42) and an options object keeps the next addition additive at the one call site,
 *  same convention as `completeAnalysisWithSynthesis`. */
export interface EntityDetailParts {
  entity: EntityRecord
  imageUrl: string | null
  stats: EntityStats
  events: Page<EntityEventItem>
  relationRows: EntityRelationForEntityRow[]
  coMentionRows: CoMentionedEntityRow[]
  mentionMonthRows: MentionMonthRow[]
  aliases: string[]
}

export function toEntityDetail({
  entity,
  imageUrl,
  stats,
  events,
  relationRows,
  coMentionRows,
  mentionMonthRows,
  aliases,
}: EntityDetailParts): EntityDetail {
  return {
    key: entity.key,
    canonicalName: entity.canonicalName,
    type: entity.type,
    wikidataId: entity.wikidataId,
    wikidataDescription: entity.wikidataDescription,
    wikipediaExtract: entity.wikipediaExtract,
    wikipediaUrl: entity.wikipediaUrl,
    imageUrl,
    aliases,
    eventCount: stats.eventCount,
    firstMentionAt: stats.firstMentionAt?.toISOString() ?? null,
    lastMentionAt: stats.lastMentionAt?.toISOString() ?? null,
    relationCount: stats.relationCount,
    coMentions: coMentionRows.map(toEntityCoMentionItem),
    mentionTimeline: mentionMonthRows.map(toEntityMentionMonth),
    events,
    relations: relationRows.map((r) => toEntityRelationItem(r, entity.key)),
  }
}
