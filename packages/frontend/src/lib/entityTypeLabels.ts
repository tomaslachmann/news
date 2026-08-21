import type { EntityTypeLabel, EntityRelationTypeLabel } from '@news-triangulator/shared'

/** Shared Czech label for an Entity's type — used by the entity search/detail pages (ticket 43)
 *  and AnalysisPage's own entity-mentions rail, so the wording can't drift between the two. */
export const ENTITY_TYPE_LABELS: Record<EntityTypeLabel, string> = {
  PERSON: 'Osoba',
  ORGANIZATION: 'Organizace',
  PLACE: 'Místo',
  COUNTRY: 'Země',
}

/** Shared Czech label for a StoryEntityRelation's type, phrased as "this entity [verb] the
 *  other entity" — read together with EntityRelationItem's own `direction` (an arrow prefix on
 *  the entity detail page) for the reverse case, rather than a second, separately-conjugated
 *  label set per direction. */
export const ENTITY_RELATION_TYPE_LABELS: Record<EntityRelationTypeLabel, string> = {
  REPRESENTS: 'Zastupuje',
  HOLDS_POSITION_IN: 'Zastává pozici v',
  WORKS_FOR: 'Pracuje pro',
  MEMBER_OF: 'Je členem',
  LOCATED_IN: 'Nachází se v',
  BASED_IN: 'Sídlí v',
  PART_OF: 'Je součástí',
  INVOLVES: 'Zahrnuje',
  MEETS: 'Setkává se s',
  ATTACKS: 'Útočí na',
  ACCUSES: 'Obviňuje',
  ANNOUNCES: 'Oznamuje',
}
