import type { EntityType, EntityRelationType } from '@prisma/client'
import { prisma } from '../db.js'
import type { Cursor } from '../pagination.js'
import { keysetSqlWhere } from './sqlPagination.js'

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
  /** This Story's own `StoryEntity.salience` for the entity (ticket 44) — how central it was to
   *  *this* Story's coverage, as opposed to `storyCount`'s cross-corpus rarity signal. */
  salience: number
}

export interface EntityRecord {
  id: string
  key: string
  canonicalName: string
  type: EntityType
  storyCount: number
  wikidataId: string | null
  /** Ticket 90 — external descriptive context, all null until an Admin links `wikidataId` and the
   *  `entity.image.enrich` job has run. */
  wikidataDescription: string | null
  wikipediaExtract: string | null
  wikipediaUrl: string | null
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
 *  possible (ADR 0024), something the JSON form this replaces could never expose. `salience` is
 *  this Story's own `StoryEntity.salience` (ticket 44), not an `Entity` field — pulled from the
 *  join row alongside the key/storyCount it's selected together with. */
export async function findStoryEntitiesForScoring(
  storyId: string
): Promise<{ entities: EntityForScoring[]; entityRelations: EntityRelationForScoring[] }> {
  const [storyEntities, storyEntityRelations] = await Promise.all([
    prisma.storyEntity.findMany({
      where: { storyId },
      select: { salience: true, entity: { select: { key: true, storyCount: true } } },
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
    entities: storyEntities.map((se) => ({ ...se.entity, salience: se.salience })),
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

/** One Entity by its deterministic key — ticket 40's test/setup-only use predates ticket 41's
 *  Wikidata-linking routes, which key off `:key` (a stable, publicly-referenceable identifier;
 *  `Entity.id` stays purely internal, ADR 0034) rather than the internal id `findEntityById`
 *  takes. */
export async function findEntityByKey(key: string): Promise<EntityRecord | null> {
  return prisma.entity.findUnique({ where: { key } })
}

/** Sets a confirmed Wikidata link (ticket 41) — the Admin has already picked `wikidataId` from a
 *  `searchWikidataEntities` result before this is ever called; this function trusts that
 *  confirmation and just persists it. */
export async function setEntityWikidataId(id: string, wikidataId: string): Promise<void> {
  await prisma.entity.update({ where: { id }, data: { wikidataId } })
}

/** Clears a previously-confirmed Wikidata link (ticket 41) — the Entity's fetched `EntityImage`
 *  rows, if any, are left in place; a wrong or stale image needs direct DB intervention, same
 *  "not scoped in this wave" posture as re-fetch (docs/spec-entity-resolution.md's Out of Scope).
 *  The external descriptive context (ticket 90) is cleared here, though — unlike an image, stale
 *  encyclopedic prose next to live coverage is actively misleading, and it's cheap to refetch on
 *  a re-link. */
export async function clearEntityWikidataId(id: string): Promise<void> {
  await prisma.entity.update({
    where: { id },
    data: { wikidataId: null, wikidataDescription: null, wikipediaExtract: null, wikipediaUrl: null },
  })
}

/** Persists the external descriptive context the `entity.image.enrich` job fetched (ticket 90).
 *  A partial write is fine and expected — an entity with a Wikidata description but no Czech
 *  Wikipedia page gets `{ description, extract: null, url: null }`. */
export async function updateEntityWikidataContext(
  id: string,
  context: { description: string | null; wikipediaExtract: string | null; wikipediaUrl: string | null }
): Promise<void> {
  await prisma.entity.update({
    where: { id },
    data: {
      wikidataDescription: context.description,
      wikipediaExtract: context.wikipediaExtract,
      wikipediaUrl: context.wikipediaUrl,
    },
  })
}

/** Total Story count — the corpus size storyRelationScoring.ts's IDF weighting needs to know how
 *  "common" an entity is. Lives here rather than repositories/analysis.ts since its only
 *  consumer is entity IDF weighting (ADR 0024, fixes P1-9). A plain `COUNT(*)` on every
 *  confirmCoverages/approveDraft call is fine at this project's current scale (no index needed,
 *  no caching); revisit if Story grows large enough for this to show up as a real cost. */
export async function countStories(): Promise<number> {
  return prisma.story.count()
}

export interface EntityMentionRow {
  key: string
  canonicalName: string
  type: EntityType
  /** This Entity's `EntityImage.imageUrl` (ticket 41), if one has been fetched — null otherwise.
   *  `toEntityMentionItem` (mappers/analysis.ts) drops this for the "Entity ve zprávě" rail, which
   *  never showed images; the Narrative pass (ticket 48 / ADR 0034) is this row's only consumer
   *  that reads it, via `KnownEntity`. */
  imageUrl: string | null
}

export interface EntityRelationForStoryRow {
  id: string
  type: EntityRelationType
  fromEntity: { key: string; canonicalName: string; type: EntityType }
  toEntity: { key: string; canonicalName: string; type: EntityType }
}

/** Shared by `findEntityRelationsForStory` and `findRelationsForEntity` below — both select each
 *  side of a `StoryEntityRelation` down to the same {key, canonicalName, type} shape, just scoped
 *  differently (one Story vs. one Entity across every Story). */
const RELATION_ENTITY_SELECT = { select: { key: true, canonicalName: true, type: true } } as const

/** Every `StoryEntityRelation` `storyId` itself asserts (ticket 47 / ADR 0034) — the companion
 *  read to `findEntityMentionsForStory` that fills `AnalysisDetail.entityRelations`, mirroring
 *  `findRelationsForEntity`'s shape but scoped to one Story instead of one Entity across every
 *  Story. No attribution needed here (unlike `findRelationsForEntity`'s `analysisId`/`headline`):
 *  every row is already scoped to this one Analysis's own Story. Unbounded, same as
 *  `findEntityMentionsForStory` — a single Story's own relation count is small (ADR 0024/P1-9). */
export async function findEntityRelationsForStory(storyId: string): Promise<EntityRelationForStoryRow[]> {
  const rows = await prisma.storyEntityRelation.findMany({
    where: { storyId },
    select: {
      id: true,
      type: true,
      fromEntity: RELATION_ENTITY_SELECT,
      toEntity: RELATION_ENTITY_SELECT,
    },
  })
  return rows
}

/** Every entity `storyId`'s own extraction pass attached (ticket 43) — powers AnalysisPage's
 *  "Entity ve zprávě" rail, each entity linking to its own `/entity/:key` page. Ordered by this
 *  Story's own `StoryEntity.salience` (ticket 12) descending, not name/extraction order — the
 *  entities most central to *this* Story's coverage lead the list. Unbounded: a single Story's own
 *  entity count is small (ADR 0024/P1-9's 30-50 ceiling), unlike the cross-Story
 *  `findEventsForEntity`/`findRelationsForEntity` reads above, which do need a bound. */
export async function findEntityMentionsForStory(storyId: string): Promise<EntityMentionRow[]> {
  const rows = await prisma.storyEntity.findMany({
    where: { storyId },
    select: {
      entity: {
        select: {
          key: true,
          canonicalName: true,
          type: true,
          // v1 has no `isPrimary` to prioritize among (ADR 0034) — an Entity has at most one
          // provider (Wikimedia) today, so the first row is the only row.
          images: { select: { imageUrl: true }, take: 1 },
        },
      },
    },
    orderBy: { salience: 'desc' },
  })
  return rows.map((r) => ({
    key: r.entity.key,
    canonicalName: r.entity.canonicalName,
    type: r.entity.type,
    imageUrl: r.entity.images[0]?.imageUrl ?? null,
  }))
}

/** The batched sibling of `findEntityMentionsForStory` — one Thread's several member Stories
 *  (ticket 68) in a single query instead of N round trips, one per member. Rows are returned in
 *  no particular per-Story grouping (the caller, `threadDetailService.ts`, dedupes by entity key
 *  across the whole Thread anyway); ordered by salience descending same as the single-Story
 *  version, so a caller that doesn't dedupe still sees the most central entities first. */
export async function findEntityMentionsForStories(storyIds: string[]): Promise<EntityMentionRow[]> {
  if (storyIds.length === 0) return []
  const rows = await prisma.storyEntity.findMany({
    where: { storyId: { in: storyIds } },
    select: {
      entity: {
        select: {
          key: true,
          canonicalName: true,
          type: true,
          images: { select: { imageUrl: true }, take: 1 },
        },
      },
    },
    orderBy: { salience: 'desc' },
  })
  return rows.map((r) => ({
    key: r.entity.key,
    canonicalName: r.entity.canonicalName,
    type: r.entity.type,
    imageUrl: r.entity.images[0]?.imageUrl ?? null,
  }))
}

export interface EntitySearchRow {
  key: string
  canonicalName: string
  type: EntityType
  storyCount: number
}

/** Name search for the reader-facing entity browse feature (ticket 42), over
 *  `entity_canonicalName_trgm_idx` — same `%`-filter/`similarity()`-order combination as
 *  `findCandidatePairs` (ticket 40): `%` lets the GIN trigram index do the filtering, `similarity`
 *  orders the (already-small) filtered set by closeness to `query`. */
export async function searchEntitiesByName(query: string, limit: number): Promise<EntitySearchRow[]> {
  return prisma.$queryRaw<EntitySearchRow[]>`
    SELECT key, "canonicalName", type, "storyCount"
    FROM "Entity"
    WHERE "canonicalName" % ${query}
    ORDER BY similarity("canonicalName", ${query}) DESC
    LIMIT ${limit}
  `
}

export interface EntityEventRow {
  /** The mentioning Event's Analysis id — what a reader navigates to (ticket 43), and the
   *  keyset-pagination cursor's own id half (mirrors `AnalysisListRow.id`, ticket 03). */
  id: string
  createdAt: Date
  seedHeadline: string
  headline: string | null
}

/** Every Event (Story) mentioning `entityKey`, keyset-paginated newest-first (ticket 42, mirrors
 *  ticket 03's pattern) — fetches `limit + 1` rows, same "peel off the extra one" convention as
 *  `findAnalysesPage`/`pagination.ts`'s `splitPage`. Ordered/paginated by `Analysis.createdAt`/
 *  `id`, not `Story`'s own `createdAt` — an Entity attaches to a Story (`StoryEntity`), but
 *  "recency" here means when the mentioning *Event* (Analysis) was created, the same field every
 *  other reader-facing list already orders by (`keysetSqlWhere`, shared with `findDraftsPage`).
 *  Only `COMPLETE` Analyses: this is a public, unauthenticated read (docs/spec-entity-wiki.md),
 *  and a Draft/Pending Analysis isn't a stable Article yet for a reader to land on (same rule
 *  `GET /api/analyses` already applies for a non-Admin reader). */
export async function findEventsForEntity(
  entityKey: string,
  cursor: Cursor | undefined,
  limit: number
): Promise<EntityEventRow[]> {
  return prisma.$queryRaw<EntityEventRow[]>`
    SELECT a.id, a."createdAt", a."seedHeadline", sr.headline
    FROM "StoryEntity" se
    JOIN "Entity" e ON e.id = se."entityId"
    JOIN "Story" s ON s.id = se."storyId"
    JOIN "Analysis" a ON a."storyId" = s.id
    LEFT JOIN "SynthesisResult" sr ON sr."analysisId" = a.id
    WHERE e.key = ${entityKey} AND a.status = 'COMPLETE'
      ${keysetSqlWhere(cursor)}
    ORDER BY a."createdAt" DESC, a.id DESC
    LIMIT ${limit + 1}
  `
}

export interface EntityRelationForEntityRow {
  id: string
  type: EntityRelationType
  fromEntity: { key: string; canonicalName: string; type: EntityType }
  toEntity: { key: string; canonicalName: string; type: EntityType }
  /** The asserting Event's own Analysis id/title fields (ticket 42) — every relation is shown
   *  attributed to the coverage that asserted it, never as a standalone fact (ADR 0022). */
  analysisId: string
  seedHeadline: string
  headline: string | null
}

// Not cursor-paginated like findEventsForEntity — the ticket only asked for a flat "every
// relation" read — but a hard cap is still needed: a very-high-storyCount entity (docs/spec-
// entity-wiki.md's User Story 10 concern, which the spec's own text only names for the Events
// read but applies equally here) would otherwise return its entire relation history in one
// unbounded response (code review, ticket 42). Newest-first so truncation drops the oldest,
// least-relevant assertions first, same bias as every other reader-facing list in this codebase.
const ENTITY_RELATIONS_FOR_ENTITY_LIMIT = 200

/** Every `StoryEntityRelation` `entityKey` participates in, either side, each carrying its own
 *  asserting Event — deliberately not deduped across Events: two Stories independently asserting
 *  the same relation are two distinct attributed claims, not one fact (ADR 0022, docs/spec-
 *  entity-wiki.md). Only relations asserted by a `COMPLETE` Analysis, same public-read rule as
 *  `findEventsForEntity`. */
export async function findRelationsForEntity(entityKey: string): Promise<EntityRelationForEntityRow[]> {
  const rows = await prisma.storyEntityRelation.findMany({
    where: {
      OR: [{ fromEntity: { key: entityKey } }, { toEntity: { key: entityKey } }],
      story: { analysis: { status: 'COMPLETE' } },
    },
    select: {
      id: true,
      type: true,
      fromEntity: RELATION_ENTITY_SELECT,
      toEntity: RELATION_ENTITY_SELECT,
      story: {
        select: {
          analysis: {
            select: { id: true, seedHeadline: true, synthesisResult: { select: { headline: true } } },
          },
        },
      },
    },
    orderBy: { id: 'desc' },
    take: ENTITY_RELATIONS_FOR_ENTITY_LIMIT,
  })

  // The `where` above already guarantees a COMPLETE Analysis exists — this type-predicate filter
  // (same pattern as findRecentStoriesForMatching/findRelationCandidateStories) narrows the type
  // accordingly rather than asserting it with `!` below.
  return rows
    .filter(
      (r): r is typeof r & { story: { analysis: NonNullable<(typeof r)['story']['analysis']> } } =>
        r.story.analysis !== null
    )
    .map((r) => ({
      id: r.id,
      type: r.type,
      fromEntity: r.fromEntity,
      toEntity: r.toEntity,
      analysisId: r.story.analysis.id,
      seedHeadline: r.story.analysis.seedHeadline,
      headline: r.story.analysis.synthesisResult?.headline ?? null,
    }))
}
