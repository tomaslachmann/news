import type { EntityType, EntityRelationType } from '@prisma/client'
import { prisma } from '../db.js'

export type { EntityType, EntityRelationType }

export interface EntityInput {
  key: string
  name: string
  type: EntityType
  confidence: number
  salience: number
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

export interface EntityRecord {
  id: string
  key: string
  canonicalName: string
  type: EntityType
  storyCount: number
}

export interface EntityRelationForScoring {
  fromKey: string
  toKey: string
  type: EntityRelationType
}

/** Resolves every distinct raw key in `entities` and collapses any that resolve to the same
 *  surviving key (ticket 40 / ADR 0033) into one `EntityInput` — a raw key with a confirmed alias
 *  must never reach the upsert below unresolved, and two raw keys from the *same* extraction batch
 *  colliding onto one survivor (a prior merge, both name variants mentioned in one article) must
 *  produce exactly one upsert/storyCount adjustment, not two independent ones for what's now a
 *  single attachment. The higher-confidence input wins an arbitrary-but-deterministic tie; which
 *  one wins doesn't affect correctness, only which `name`/`confidence` gets persisted for a rare
 *  same-batch collision. Also returns which raw keys collapsed into which resolved key, so the
 *  caller can still look entity ids up by the *original* raw key entityRelations reference. */
async function resolveEntityInputs(
  entities: EntityInput[],
  resolveEntityKey: (key: string) => Promise<string>
): Promise<{ resolved: EntityInput[]; rawKeysByResolvedKey: Map<string, string[]> }> {
  // Independent lookups, parallelized — a human-seeded Story's extraction pass can produce 30-50
  // distinct entities (ADR 0024/P1-9), and resolving them one at a time would serialize that many
  // extra DB round trips before the transaction below even opens.
  const uniqueRawKeys = [...new Set(entities.map((e) => e.key))]
  const resolvedKeys = await Promise.all(uniqueRawKeys.map((rawKey) => resolveEntityKey(rawKey)))
  const resolvedKeyByRawKey = new Map(uniqueRawKeys.map((rawKey, i) => [rawKey, resolvedKeys[i]]))

  const rawKeysByResolvedKey = new Map<string, string[]>()
  const byResolvedKey = new Map<string, EntityInput>()
  for (const e of entities) {
    const resolvedKey = resolvedKeyByRawKey.get(e.key)!
    const rawKeys = rawKeysByResolvedKey.get(resolvedKey) ?? []
    rawKeys.push(e.key)
    rawKeysByResolvedKey.set(resolvedKey, rawKeys)

    const existing = byResolvedKey.get(resolvedKey)
    if (!existing || e.confidence > existing.confidence) {
      byResolvedKey.set(resolvedKey, { ...e, key: resolvedKey })
    }
  }

  return { resolved: [...byResolvedKey.values()], rawKeysByResolvedKey }
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
 * `resolveEntityKey` (ticket 40 / ADR 0033) routes every freshly-derived key through any confirmed
 * alias before it's used to upsert/diff — this is the actual persistence boundary, so it's the one
 * place that resolution has to happen for correctness to hold, regardless of which caller forgot
 * to resolve upstream. Defaults to the identity function so every pre-ticket-40 caller (and every
 * existing test) is unaffected; the real production wiring passes
 * `repositories/entityAlias.ts`'s `resolveEntityKey` explicitly (see worker.ts).
 *
 * `timeout` is raised from Prisma's 5s default: this function does one sequential round trip per
 * entity (human-seeded Stories extract 30-50 per ADR 0024/P1-9), which can approach 5s under
 * ordinary DB latency, not just contention.
 */
export async function replaceStoryEntities(
  storyId: string,
  entities: EntityInput[],
  entityRelations: EntityRelationInput[],
  resolveEntityKey: (key: string) => Promise<string> = (key) => Promise.resolve(key)
): Promise<void> {
  const { resolved, rawKeysByResolvedKey } = await resolveEntityInputs(entities, resolveEntityKey)

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${storyId}))`

      const existing = await tx.storyEntity.findMany({
        where: { storyId },
        select: { entityId: true, entity: { select: { key: true } } },
      })
      const existingKeys = new Set(existing.map((e) => e.entity.key))
      const newKeys = new Set(resolved.map((e) => e.key))

      const removedEntityIds = existing.filter((e) => !newKeys.has(e.entity.key)).map((e) => e.entityId)
      if (removedEntityIds.length > 0) {
        await tx.storyEntity.deleteMany({ where: { storyId, entityId: { in: removedEntityIds } } })
        await tx.entity.updateMany({
          where: { id: { in: removedEntityIds } },
          data: { storyCount: { decrement: 1 } },
        })
      }

      // Keyed by every *raw* key that resolved into this entity, not just its own (possibly
      // resolved) key — entityRelations' from/to below were derived from the same raw keys this
      // Story's extraction pass produced, before resolution ever ran.
      const keyToEntityId = new Map<string, string>()
      for (const e of resolved) {
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
        for (const rawKey of rawKeysByResolvedKey.get(e.key) ?? [e.key]) keyToEntityId.set(rawKey, entity.id)
        await tx.storyEntity.upsert({
          where: { storyId_entityId: { storyId, entityId: entity.id } },
          create: { storyId, entityId: entity.id, confidence: e.confidence, salience: e.salience },
          update: { confidence: e.confidence, salience: e.salience },
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

/** One Story's attachment to one Entity, by the entity's own deterministic key — used where a
 *  caller needs a specific attachment's stored fields (e.g. verifying persisted `salience`)
 *  rather than the whole scoring-shaped set `findStoryEntitiesForScoring` returns. */
export async function findStoryEntity(
  storyId: string,
  entityKey: string
): Promise<{ confidence: number; salience: number } | null> {
  return prisma.storyEntity.findFirst({
    where: { storyId, entity: { key: entityKey } },
    select: { confidence: true, salience: true },
  })
}

/** One Entity by id, or null if it doesn't exist — the existence/type check ticket 40's
 *  entityAliasService.ts needs before confirming a merge (a request naming an id that isn't a real
 *  Entity, or pairing two different types, must fail validation before mergeEntities ever runs). */
export async function findEntityById(id: string): Promise<EntityRecord | null> {
  return prisma.entity.findUnique({ where: { id } })
}

/** One Entity by its deterministic key, or null — test/setup-only today (ADR 0010 keeps direct
 *  `db.ts` access inside repositories/, so a caller that only needs "the id I just upserted via
 *  replaceStoryEntities" has to come through here rather than reaching for prisma directly). */
export async function findEntityByKey(key: string): Promise<EntityRecord | null> {
  return prisma.entity.findUnique({ where: { key } })
}

/** Total Story count — the corpus size storyRelationScoring.ts's IDF weighting needs to know how
 *  "common" an entity is. Lives here rather than repositories/analysis.ts since its only
 *  consumer is entity IDF weighting (ADR 0024, fixes P1-9). A plain `COUNT(*)` on every
 *  confirmCoverages/approveDraft call is fine at this project's current scale (no index needed,
 *  no caching); revisit if Story grows large enough for this to show up as a real cost. */
export async function countStories(): Promise<number> {
  return prisma.story.count()
}
