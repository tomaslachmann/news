import type { EntityType, EntityRelationType } from '@prisma/client'
import { prisma } from '../db.js'

export type { EntityType, EntityRelationType }

export interface EntityInput {
  key: string
  name: string
  type: EntityType
  confidence: number
}

export interface EntityRelationInput {
  from: string
  to: string
  type: EntityRelationType
  confidence: number
}

export interface EntityForScoring {
  key: string
  storyCount: number
}

export interface EntityRelationForScoring {
  fromKey: string
  toKey: string
  type: EntityRelationType
}

/**
 * Replaces `storyId`'s entire entity/entity-relation set with `entities`/`entityRelations` — a
 * whole-set replace, not a diff the caller computes, matching the semantics of the JSON column
 * this repository replaces (Story.entities used to be overwritten wholesale on each successful
 * extraction pass). `Entity.storyCount` is maintained transactionally here, incrementing only
 * for a key genuinely new to this Story and decrementing only for one this Story no longer has —
 * never a periodic correction pass (ADR 0024): no code path deletes a Story or StoryEntity today,
 * so the only source of drift would be a bug in this function's own accounting.
 */
export async function replaceStoryEntities(
  storyId: string,
  entities: EntityInput[],
  entityRelations: EntityRelationInput[]
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.storyEntity.findMany({
      where: { storyId },
      select: { entityId: true, entity: { select: { key: true } } },
    })
    const existingKeys = new Set(existing.map((e) => e.entity.key))
    const newKeys = new Set(entities.map((e) => e.key))

    const removedEntityIds = existing.filter((e) => !newKeys.has(e.entity.key)).map((e) => e.entityId)
    if (removedEntityIds.length > 0) {
      await tx.storyEntity.deleteMany({ where: { storyId, entityId: { in: removedEntityIds } } })
      await tx.entity.updateMany({
        where: { id: { in: removedEntityIds } },
        data: { storyCount: { decrement: 1 } },
      })
    }

    const keyToEntityId = new Map<string, string>()
    for (const e of entities) {
      const isNewAttachment = !existingKeys.has(e.key)
      const entity = await tx.entity.upsert({
        where: { key: e.key },
        // canonicalName is refreshed on every match, not just on create — a later extraction
        // pass over more/better source text can surface a fuller normalized form of a name
        // already seen (ADR 0022's "the model normalizes a mention to its fullest known form").
        create: { key: e.key, type: e.type, canonicalName: e.name, storyCount: 1 },
        update: { canonicalName: e.name, ...(isNewAttachment ? { storyCount: { increment: 1 } } : {}) },
      })
      keyToEntityId.set(e.key, entity.id)
      await tx.storyEntity.upsert({
        where: { storyId_entityId: { storyId, entityId: entity.id } },
        create: { storyId, entityId: entity.id, confidence: e.confidence },
        update: { confidence: e.confidence },
      })
    }

    // Relations are always fully replaced rather than diffed like entities above — cheap (a
    // Story's own relation count is small) and avoids a second delta computation.
    await tx.storyEntityRelation.deleteMany({ where: { storyId } })
    for (const r of entityRelations) {
      const fromEntityId = keyToEntityId.get(r.from)
      const toEntityId = keyToEntityId.get(r.to)
      // entityExtractionPass only ever resolves a relation's from/to against an entity key it
      // extracted in the same call, so this pair is always present in `entities` above — this
      // guard exists for a caller that doesn't hold that invariant, not an expected path here.
      if (!fromEntityId || !toEntityId) continue
      await tx.storyEntityRelation.create({
        data: { storyId, fromEntityId, toEntityId, type: r.type, confidence: r.confidence },
      })
    }
  })
}

/** The current, authoritative entity/entity-relation set for one Story, shaped for
 *  storyRelationScoring.ts — `storyCount` alongside each key is what makes IDF weighting
 *  possible (ADR 0024), something the JSON form this replaces could never expose. */
export async function findStoryEntitiesForScoring(
  storyId: string
): Promise<{ entities: EntityForScoring[]; entityRelations: EntityRelationForScoring[] }> {
  const [storyEntities, storyEntityRelations] = await Promise.all([
    prisma.storyEntity.findMany({
      where: { storyId },
      select: { entity: { select: { key: true, storyCount: true } } },
    }),
    prisma.storyEntityRelation.findMany({
      where: { storyId },
      select: {
        type: true,
        fromEntity: { select: { key: true } },
        toEntity: { select: { key: true } },
      },
    }),
  ])

  return {
    entities: storyEntities.map((se) => se.entity),
    entityRelations: storyEntityRelations.map((r) => ({
      fromKey: r.fromEntity.key,
      toKey: r.toEntity.key,
      type: r.type,
    })),
  }
}

/** Total Story count — the corpus size storyRelationScoring.ts's IDF weighting needs to know how
 *  "common" an entity is. Lives here rather than repositories/analysis.ts since its only
 *  consumer is entity IDF weighting (ADR 0024, fixes P1-9). */
export async function countStories(): Promise<number> {
  return prisma.story.count()
}
