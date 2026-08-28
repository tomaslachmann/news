import type { WikidataSuggestionCandidate } from '@news-triangulator/shared'
import type { EntityType, Prisma } from '@prisma/client'
import { prisma } from '../db.js'

export type { WikidataSuggestionCandidate }

/** An unlinked Entity the scheduled scan (ticket 93 / ADR 0042) should try to link this run. */
export interface ScanEntity {
  id: string
  key: string
  canonicalName: string
  type: EntityType
}

function scanWhere(minStoryCount: number, suggestionStaleBefore: Date): Prisma.EntityWhereInput {
  return {
    wikidataId: null,
    storyCount: { gte: minStoryCount },
    // A merged-away entity (ticket 40) is inert — resolveEntityKey redirects it — never a link target.
    mergedInto: { is: null },
    OR: [
      { wikidataSuggestion: { is: null } },
      { wikidataSuggestion: { updatedAt: { lt: suggestionStaleBefore } } },
    ],
  }
}

/** Unlinked entities worth a scan this run: no `wikidataId`, at least `minStoryCount` stories, not
 *  merged away, and either no suggestion yet or one last refreshed before `suggestionStaleBefore`.
 *  Busiest first, capped at `limit` — the caller logs how many were left over. */
export async function findUnlinkedEntitiesForScan(params: {
  minStoryCount: number
  suggestionStaleBefore: Date
  limit: number
}): Promise<ScanEntity[]> {
  return prisma.entity.findMany({
    where: scanWhere(params.minStoryCount, params.suggestionStaleBefore),
    orderBy: [{ storyCount: 'desc' }, { id: 'asc' }],
    take: params.limit,
    select: { id: true, key: true, canonicalName: true, type: true },
  })
}

/** Total number of entities matching the same scan filter — for the "N left for the next run" log. */
export async function countUnlinkedEntitiesForScan(params: {
  minStoryCount: number
  suggestionStaleBefore: Date
}): Promise<number> {
  return prisma.entity.count({ where: scanWhere(params.minStoryCount, params.suggestionStaleBefore) })
}

/** Q-ids an Admin has permanently ruled out for this entity (`EntityWikidataCandidateRejection`) —
 *  the scan drops these from every candidate set before scoring. */
export async function findRejectedQidsByEntity(entityId: string): Promise<string[]> {
  const rows = await prisma.entityWikidataCandidateRejection.findMany({
    where: { entityId },
    select: { qid: true },
  })
  return rows.map((r) => r.qid)
}

/** Replaces this entity's suggestion with a freshly-scored candidate set (one row per entity). */
export async function upsertSuggestion(
  entityId: string,
  candidates: WikidataSuggestionCandidate[]
): Promise<void> {
  const json = candidates as unknown as Prisma.InputJsonValue
  await prisma.entityWikidataSuggestion.upsert({
    where: { entityId },
    create: { entityId, candidates: json },
    update: { candidates: json },
  })
}

/** Idempotent — no-op if the entity has no suggestion row (the Admin already acted, or a scan
 *  cleared it). */
export async function deleteSuggestion(entityId: string): Promise<void> {
  await prisma.entityWikidataSuggestion.deleteMany({ where: { entityId } })
}

export interface RawSuggestion {
  entityKey: string
  canonicalName: string
  type: EntityType
  candidates: WikidataSuggestionCandidate[]
}

/** Every pending suggestion for the admin review queue, most-recently-scanned first. */
export async function listSuggestions(): Promise<RawSuggestion[]> {
  const rows = await prisma.entityWikidataSuggestion.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      candidates: true,
      entity: { select: { key: true, canonicalName: true, type: true } },
    },
  })
  return rows.map((r) => ({
    entityKey: r.entity.key,
    canonicalName: r.entity.canonicalName,
    type: r.entity.type,
    candidates: r.candidates as unknown as WikidataSuggestionCandidate[],
  }))
}

/** This entity's pending suggestion candidates, or null — the confirm/reject endpoints validate a
 *  submitted Q-id against this. */
export async function findSuggestionCandidates(
  entityId: string
): Promise<WikidataSuggestionCandidate[] | null> {
  const row = await prisma.entityWikidataSuggestion.findUnique({
    where: { entityId },
    select: { candidates: true },
  })
  return row ? (row.candidates as unknown as WikidataSuggestionCandidate[]) : null
}

/** Records that `qid` is permanently not this entity (ticket 93) — idempotent, mirrors
 *  `entityAlias.rejectCandidatePair`. */
export async function rejectCandidate(entityId: string, qid: string, rejectedBy: string): Promise<void> {
  await prisma.entityWikidataCandidateRejection.upsert({
    where: { entityId_qid: { entityId, qid } },
    create: { entityId, qid, rejectedBy },
    update: {},
  })
}
