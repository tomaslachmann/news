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
 *
 * Takes a `pg_advisory_xact_lock` on `storyId` for the duration of the transaction: without it,
 * two concurrent calls for the same Story (a retried extraction racing the original, or two
 * pipeline triggers landing close together) would both read the same "existing entities"
 * snapshot and could both apply a `storyCount` increment for what should be a single attachment,
 * corrupting the very count IDF weighting depends on. The lock only serializes writes to the
 * *same* Story — unrelated Stories' calls run concurrently as before.
 *
 * `timeout` is raised from Prisma's 5s default: this function does one sequential round trip per
 * entity (human-seeded Stories extract 30-50 per ADR 0024/P1-9), which can approach 5s under
 * ordinary DB latency, not just contention.
 */
export async function replaceStoryEntities(
  storyId: string,
  entities: EntityInput[],
  entityRelations: EntityRelationInput[]
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${storyId}))`

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
          // already seen (ADR 0022's "the model normalizes a mention to its fullest known
          // form").
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
    },
    // Default 5s is tight for a sequential per-entity round trip at the 30-50 entity volume
    // this migration is meant to handle well (ADR 0024/P1-9) — 20s gives real headroom without
    // masking a genuinely stuck transaction.
    { timeout: 20_000 }
  )
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
 *  consumer is entity IDF weighting (ADR 0024, fixes P1-9). A plain `COUNT(*)` on every
 *  confirmCoverages/approveDraft call is fine at this project's current scale (no index needed,
 *  no caching); revisit if Story grows large enough for this to show up as a real cost. */
export async function countStories(): Promise<number> {
  return prisma.story.count()
}
