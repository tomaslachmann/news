import type { EntityType } from '@prisma/client'
import { prisma } from '../db.js'

export type { EntityType }

// Trigram similarity is a starting point, not a tuned result — same convention as
// storyMatching.ts's MATCH_THRESHOLD: revisit once real candidate-suggestion data exists to
// calibrate against.
export const ENTITY_ALIAS_SIMILARITY_THRESHOLD = 0.4
export const ENTITY_ALIAS_CANDIDATE_LIMIT = 50

export interface EntityAliasCandidateEntity {
  id: string
  canonicalName: string
  type: EntityType
  storyCount: number
}

export interface EntityAliasCandidatePair {
  pairId: string
  entityA: EntityAliasCandidateEntity
  entityB: EntityAliasCandidateEntity
  similarity: number
}

interface CandidateRow {
  entityIdA: string
  canonicalNameA: string
  typeA: EntityType
  storyCountA: number
  entityIdB: string
  canonicalNameB: string
  typeB: EntityType
  storyCountB: number
  similarity: number
}

function makePairId(entityIdA: string, entityIdB: string): string {
  return `${entityIdA}:${entityIdB}`
}

/** `pairId`s from `findCandidatePairs` are `${entityIdA}:${entityIdB}` with `entityIdA` <
 *  `entityIdB` (string comparison) — there's no persisted row for a not-yet-decided candidate to
 *  key off (candidates are computed fresh on every call), so confirm/reject decode this composite
 *  id back into the two entity ids rather than looking one up. cuid ids never contain `:`. */
export function parsePairId(pairId: string): [string, string] {
  const [entityIdA, entityIdB] = pairId.split(':')
  if (!entityIdA || !entityIdB || entityIdA >= entityIdB) {
    throw new Error(`Malformed entity-alias pairId: ${pairId}`)
  }
  return [entityIdA, entityIdB]
}

/** Orders two entity ids the same way every candidate pair / rejection row does (plain string
 *  comparison) — callers that receive two ids in arbitrary order (a reject request body) normalize
 *  through this before writing a pair, so the same real-world pair always produces the same
 *  `pairId` / rejection row regardless of which order it was submitted in. */
export function orderEntityPair(entityId1: string, entityId2: string): [string, string] {
  return entityId1 < entityId2 ? [entityId1, entityId2] : [entityId2, entityId1]
}

/** Same-type Entity pairs ranked by `canonicalName` trigram similarity (ticket 12's
 *  `entity_canonicalName_trgm_idx` — this is its first real consumer). Excludes any entity already
 *  merged away (appearing as `EntityAlias.mergedFromEntityId` on either side — it isn't a live
 *  identity to suggest merging anymore, `resolveEntityKey` already redirects it) and any pair
 *  already rejected (`EntityAliasRejection`). `a.id < b.id` both dedupes mirror pairs and rules out
 *  self-pairs. Threshold/limit are implementation-time tunable constants, same convention as
 *  `storyMatching.ts`'s `MATCH_THRESHOLD`. */
export async function findCandidatePairs(
  threshold: number = ENTITY_ALIAS_SIMILARITY_THRESHOLD,
  limit: number = ENTITY_ALIAS_CANDIDATE_LIMIT
): Promise<EntityAliasCandidatePair[]> {
  const rows = await prisma.$queryRaw<CandidateRow[]>`
    SELECT
      a.id AS "entityIdA", a."canonicalName" AS "canonicalNameA", a.type AS "typeA", a."storyCount" AS "storyCountA",
      b.id AS "entityIdB", b."canonicalName" AS "canonicalNameB", b.type AS "typeB", b."storyCount" AS "storyCountB",
      similarity(a."canonicalName", b."canonicalName") AS similarity
    FROM "Entity" a
    JOIN "Entity" b ON a.type = b.type AND a.id < b.id
    WHERE similarity(a."canonicalName", b."canonicalName") > ${threshold}
      AND a.id NOT IN (SELECT "mergedFromEntityId" FROM "EntityAlias")
      AND b.id NOT IN (SELECT "mergedFromEntityId" FROM "EntityAlias")
      AND NOT EXISTS (
        SELECT 1 FROM "EntityAliasRejection" r WHERE r."entityIdA" = a.id AND r."entityIdB" = b.id
      )
    ORDER BY similarity DESC
    LIMIT ${limit}
  `

  return rows.map((r) => ({
    pairId: makePairId(r.entityIdA, r.entityIdB),
    entityA: { id: r.entityIdA, canonicalName: r.canonicalNameA, type: r.typeA, storyCount: r.storyCountA },
    entityB: { id: r.entityIdB, canonicalName: r.canonicalNameB, type: r.typeB, storyCount: r.storyCountB },
    similarity: r.similarity,
  }))
}

/** Returns the surviving key if `key` has a confirmed alias (ticket 40 / ADR 0033), else `key`
 *  unchanged — a single lookup, never a chain to walk: `mergeEntities` flattens any alias whose own
 *  `entityId` is later merged away, so every alias row already points at its final survivor. Every
 *  entity-resolution call site routes a freshly-derived key through this before it's used to
 *  upsert/query (see `repositories/entity.ts`'s `replaceStoryEntities`). */
export async function resolveEntityKey(key: string): Promise<string> {
  const alias = await prisma.entityAlias.findUnique({
    where: { alias: key },
    select: { entity: { select: { key: true } } },
  })
  return alias?.entity.key ?? key
}

/** Records that `entityId1`/`entityId2` (either order) is not the same real-world entity —
 *  permanent, mirrors `StoryRelation.status`'s REJECTED semantics (ticket 36):
 *  `findCandidatePairs` excludes this pair from every future call. Idempotent — rejecting an
 *  already-rejected pair is a silent no-op rather than a unique-constraint error, since two
 *  independent reject clicks (or a retried request) describe the same outcome, not a conflict. */
export async function rejectCandidatePair(
  entityId1: string,
  entityId2: string,
  rejectedBy: string
): Promise<void> {
  const [entityIdA, entityIdB] = orderEntityPair(entityId1, entityId2)
  await prisma.entityAliasRejection.upsert({
    where: { entityIdA_entityIdB: { entityIdA, entityIdB } },
    create: { entityIdA, entityIdB, rejectedBy },
    update: {},
  })
}

/** Thrown when `mergeEntities` is asked to merge an entity that's already been merged away once
 *  before (`EntityAlias.mergedFromEntityId` is `@unique`) — a double-confirm race (two admins, or
 *  a retried request) rather than a bug, so this is a distinct catchable type instead of a raw
 *  Prisma constraint error reaching the caller. */
export class AlreadyMergedError extends Error {}

/** Merges `mergedAwayEntityId` into `survivingEntityId` (ticket 40 / ADR 0033): creates the
 *  `EntityAlias` redirect, repoints every `StoryEntity`/`StoryEntityRelation` row from the
 *  merged-away entity to the survivor, and flattens any alias that already pointed at the
 *  merged-away entity directly onto the new survivor instead — so `resolveEntityKey` never needs
 *  to walk a chain, even when a survivor from an earlier merge is itself later merged into a
 *  different entity (the spec's own "a third fragment gets its own merge action against the
 *  (by-then) surviving row" — if that surviving row later merges too, everything that already
 *  pointed at it has to move with it). The merged-away `Entity` row itself is never deleted.
 *
 *  Assumes both ids exist and share the same `type` — the caller (entityAliasService.ts) is the
 *  system boundary that validates a real request against real candidate data; this function
 *  trusts its inputs, matching this codebase's "validate at the boundary" convention.
 *
 *  A Story that already has both entities separately attached (rare but possible — both were
 *  extracted independently before the merge) can't have its merged-away `StoryEntity` row simply
 *  repointed without violating the `[storyId, entityId]` primary key the surviving row already
 *  occupies; that row is dropped instead, keeping the survivor's existing confidence/salience.
 *  Same reasoning for `StoryEntityRelation`: repointing can produce a self-relation (both sides
 *  now the same entity, violating the DB's no-self-relation CHECK constraint) or a duplicate of a
 *  row that already exists on the survivor's side — both are dropped rather than repointed.
 *  `Entity.storyCount` is recomputed for the survivor from the post-repoint `StoryEntity` rows
 *  (a plain count, not a sum of the two prior counts) precisely because of that dedup — a Story
 *  attached to both before the merge must only count once after it. */
export async function mergeEntities(
  survivingEntityId: string,
  mergedAwayEntityId: string,
  confirmedBy: string
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const alreadyMerged = await tx.entityAlias.findUnique({
        where: { mergedFromEntityId: mergedAwayEntityId },
      })
      if (alreadyMerged) {
        throw new AlreadyMergedError(
          `Entity ${mergedAwayEntityId} has already been merged into another entity`
        )
      }

      const mergedAway = await tx.entity.findUniqueOrThrow({ where: { id: mergedAwayEntityId } })

      // Flatten: any alias that currently resolves to the entity we're about to merge away must
      // resolve to the new survivor instead, or resolveEntityKey would return a key that itself
      // still needs re-resolving.
      await tx.entityAlias.updateMany({
        where: { entityId: mergedAwayEntityId },
        data: { entityId: survivingEntityId },
      })

      await tx.entityAlias.create({
        data: {
          entityId: survivingEntityId,
          alias: mergedAway.key,
          mergedFromEntityId: mergedAwayEntityId,
          confirmedBy,
        },
      })

      const [staleStoryEntities, survivorStoryEntities] = await Promise.all([
        tx.storyEntity.findMany({ where: { entityId: mergedAwayEntityId } }),
        tx.storyEntity.findMany({ where: { entityId: survivingEntityId }, select: { storyId: true } }),
      ])
      const survivorStoryIds = new Set(survivorStoryEntities.map((r) => r.storyId))
      for (const se of staleStoryEntities) {
        if (survivorStoryIds.has(se.storyId)) {
          await tx.storyEntity.delete({
            where: { storyId_entityId: { storyId: se.storyId, entityId: mergedAwayEntityId } },
          })
        } else {
          await tx.storyEntity.update({
            where: { storyId_entityId: { storyId: se.storyId, entityId: mergedAwayEntityId } },
            data: { entityId: survivingEntityId },
          })
        }
      }

      const [staleFrom, staleTo] = await Promise.all([
        tx.storyEntityRelation.findMany({ where: { fromEntityId: mergedAwayEntityId } }),
        tx.storyEntityRelation.findMany({ where: { toEntityId: mergedAwayEntityId } }),
      ])
      // A row can appear in at most one of the two lists — the no-self-relation CHECK constraint
      // already rules out fromEntityId === toEntityId at creation time.
      for (const rel of [...staleFrom, ...staleTo]) {
        const newFrom = rel.fromEntityId === mergedAwayEntityId ? survivingEntityId : rel.fromEntityId
        const newTo = rel.toEntityId === mergedAwayEntityId ? survivingEntityId : rel.toEntityId
        if (newFrom === newTo) {
          await tx.storyEntityRelation.delete({ where: { id: rel.id } })
          continue
        }
        const duplicate = await tx.storyEntityRelation.findUnique({
          where: {
            storyId_fromEntityId_toEntityId_type: {
              storyId: rel.storyId,
              fromEntityId: newFrom,
              toEntityId: newTo,
              type: rel.type,
            },
          },
        })
        if (duplicate) {
          await tx.storyEntityRelation.delete({ where: { id: rel.id } })
        } else {
          await tx.storyEntityRelation.update({
            where: { id: rel.id },
            data: { fromEntityId: newFrom, toEntityId: newTo },
          })
        }
      }

      const storyCount = await tx.storyEntity.count({ where: { entityId: survivingEntityId } })
      await tx.entity.update({ where: { id: survivingEntityId }, data: { storyCount } })
    },
    // Same generous margin as replaceStoryEntities: this does several sequential round trips
    // (repoint loops sized by however many Stories/relations mention the merged-away entity), not
    // one bulk statement.
    { timeout: 20_000 }
  )
}
