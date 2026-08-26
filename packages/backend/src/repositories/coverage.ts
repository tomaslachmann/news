import type { ArticleCategory, Coverage, CoverageStatus, Prisma } from '@prisma/client'
import { prisma } from '../db.js'

export type { Coverage, CoverageStatus, ArticleCategory }

export interface NewCoverage {
  analysisId: string
  sourceId: string
  title?: string
  articleUrl: string
  publishedAt?: string
  status: CoverageStatus
  /** Resolved via resolveCategoryForCandidate (articleCategoryMapping.ts) before this is
   *  constructed -- feed-implied (ticket 79's SourceFeed.category) when the candidate's own feed
   *  is category-scoped, otherwise resolvePrimaryCategory's per-item mapping-table lookup (ticket
   *  78). `null` (never a guessed default) when neither resolves. */
  primaryCategory?: ArticleCategory | null
}

export type CoverageWithSource = Coverage & { source: { name: string } }

/** Which of `candidates` actually landed as the active Coverage row for their (analysisId,
 *  sourceId) — createMany's `skipDuplicates` silently no-ops a row whose source already has an
 *  active row (e.g. a concurrent writer for the same source won the unique-index race first) and
 *  its own return value (`{ count }`) can't say which rows those were (code review, ticket 03).
 *  Matched by (sourceId, articleUrl): if the row now active for a candidate's source has a
 *  different articleUrl, that candidate's insert was the one skipped. */
async function findPersisted(
  tx: Prisma.TransactionClient,
  analysisId: string,
  candidates: NewCoverage[]
): Promise<NewCoverage[]> {
  if (candidates.length === 0) return []
  const activeUrlBySource = new Map(
    (
      await tx.coverage.findMany({
        where: { analysisId, sourceId: { in: candidates.map((c) => c.sourceId) }, excluded: false },
        select: { sourceId: true, articleUrl: true },
      })
    ).map((c) => [c.sourceId, c.articleUrl])
  )
  return candidates.filter((c) => activeUrlBySource.get(c.sourceId) === c.articleUrl)
}

export async function createCoverages(coverages: NewCoverage[]): Promise<void> {
  if (coverages.length === 0) return
  // skipDuplicates: defense-in-depth for the partial unique index on (analysisId, sourceId) —
  // callers should never pass two rows for the same (analysisId, sourceId), but a caller-level
  // dedup bug or a race with a concurrent write should degrade to "one Coverage created" rather
  // than the whole batch throwing and creating none (docs/audit.md P0-6, ticket 02).
  await prisma.coverage.createMany({ data: coverages, skipDuplicates: true })
}

/** Atomically checks the active-Coverage cap and inserts, all under one row lock — a plain
 *  count-then-insert lets two concurrent calls for the same Analysis each read the count before
 *  either writes, so both pass the cap check and the total ends up over the limit (code review,
 *  ticket 03). `SELECT ... FOR UPDATE` on the Analysis row serializes concurrent calls for the
 *  same analysisId; unrelated Analyses aren't blocked. All-or-nothing reject, unlike
 *  addCoveragesUpToLimit's truncation — right for these single-row attach paths
 *  (attachSeedToMatch, Ingestion's match-to-existing-Draft/PENDING attach), where the caller
 *  treats `ok: false` as "skip this one row" rather than surfacing a hard error. See
 *  reconcileCoverages for confirmCoverages' variant, which also excludes/includes existing
 *  Coverage in the same transaction. */
export async function addCoveragesIfWithinLimit(
  analysisId: string,
  newCoverages: NewCoverage[],
  maxTotal: number
): Promise<{ ok: true } | { ok: false; activeCount: number }> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Analysis" WHERE id = ${analysisId} FOR UPDATE`
    const activeCount = await tx.coverage.count({ where: { analysisId, excluded: false } })
    if (activeCount + newCoverages.length > maxTotal) {
      return { ok: false, activeCount }
    }
    if (newCoverages.length > 0) {
      await tx.coverage.createMany({ data: newCoverages, skipDuplicates: true })
      const persisted = await findPersisted(tx, analysisId, newCoverages)
      if (persisted.length < newCoverages.length) {
        return { ok: false, activeCount }
      }
    }
    return { ok: true }
  })
}

/** Atomically inserts as many of newCoverages as fit under the cap, truncating rather than
 *  rejecting the whole batch outright — unlike reconcileCoverages/addCoveragesIfWithinLimit's
 *  all-or-nothing reject (right for a direct user action that should hard-fail), discoverSources
 *  is a background suggestion step: offering whatever room remains is more useful than dropping
 *  every candidate it found because a handful didn't fit (code review, ticket 03). */
export async function addCoveragesUpToLimit(
  analysisId: string,
  newCoverages: NewCoverage[],
  maxTotal: number
): Promise<{ inserted: NewCoverage[]; droppedCount: number }> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Analysis" WHERE id = ${analysisId} FOR UPDATE`
    const activeCount = await tx.coverage.count({ where: { analysisId, excluded: false } })
    const room = Math.max(0, maxTotal - activeCount)
    const attempted = newCoverages.slice(0, room)
    if (attempted.length > 0) {
      await tx.coverage.createMany({ data: attempted, skipDuplicates: true })
    }
    const inserted = await findPersisted(tx, analysisId, attempted)
    return { inserted, droppedCount: newCoverages.length - inserted.length }
  })
}

class CapExceededError extends Error {
  constructor(public activeCount: number) {
    super('MAX_COVERAGES_PER_ANALYSIS exceeded')
  }
}

/** confirmCoverages' exclude/include/insert, all in the one transaction addCoveragesIfWithinLimit
 *  uses for its own cap check — folded together because excludeCoverages/includeCoverages used to
 *  run as separate, immediately-committed writes before the cap check, so a request the cap
 *  rejected could still permanently re-include previously-excluded Coverage (code review, ticket
 *  03). Throwing CapExceededError inside the transaction rolls back the exclude/include writes
 *  along with it — a rejected request now leaves no partial state. */
export async function reconcileCoverages(
  analysisId: string,
  confirmedIds: string[],
  newCoverages: NewCoverage[],
  maxTotal: number
): Promise<{ ok: true } | { ok: false; activeCount: number }> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Analysis" WHERE id = ${analysisId} FOR UPDATE`
      await tx.coverage.updateMany({
        where: { analysisId, id: { notIn: confirmedIds } },
        data: { excluded: true },
      })
      await tx.coverage.updateMany({
        where: { analysisId, id: { in: confirmedIds } },
        data: { excluded: false },
      })
      const activeCount = await tx.coverage.count({ where: { analysisId, excluded: false } })
      if (activeCount + newCoverages.length > maxTotal) {
        throw new CapExceededError(activeCount)
      }
      if (newCoverages.length > 0) {
        await tx.coverage.createMany({ data: newCoverages, skipDuplicates: true })
      }
    })
    return { ok: true }
  } catch (err) {
    if (err instanceof CapExceededError) return { ok: false, activeCount: err.activeCount }
    throw err
  }
}

/** Non-excluded coverages for an Analysis, optionally narrowed to one status. Includes the
 *  Source relation — every caller needs the display name (Source.name), never a free-text
 *  outlet column (see docs/audit.md P0-6, fixed by ticket 02). */
export async function findCoveragesForAnalysis(
  analysisId: string,
  opts: { onlyStatus?: CoverageStatus } = {}
): Promise<CoverageWithSource[]> {
  return prisma.coverage.findMany({
    where: { analysisId, excluded: false, ...(opts.onlyStatus ? { status: opts.onlyStatus } : {}) },
    orderBy: { id: 'asc' },
    include: { source: { select: { name: true } } },
  })
}

/** Every article URL ever recorded for an Analysis, including excluded ones — used for de-duping. */
export async function findCoverageUrlsForAnalysis(analysisId: string): Promise<string[]> {
  const rows = await prisma.coverage.findMany({ where: { analysisId }, select: { articleUrl: true } })
  return rows.map((r) => r.articleUrl)
}

export async function updateCoverage(
  id: string,
  data: { extractedText?: string; status?: CoverageStatus; extractionResult?: Prisma.InputJsonValue }
): Promise<void> {
  await prisma.coverage.update({ where: { id }, data })
}

export async function excludeCoverages(analysisId: string, keepIds: string[]): Promise<void> {
  await prisma.coverage.updateMany({
    where: { analysisId, id: { notIn: keepIds } },
    data: { excluded: true },
  })
}

/** Excludes exactly the given Coverage ids — unlike excludeCoverages (which excludes everything
 *  *not* in a keep-list), this never touches a row that isn't named, so it's safe to call after
 *  a slow async gap (e.g. LLM verification) during which unrelated Coverage may have been
 *  attached concurrently by another process. See ticket 24. */
export async function excludeCoverageIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await prisma.coverage.updateMany({ where: { id: { in: ids } }, data: { excluded: true } })
}

/** Every Coverage article URL from the last `sinceHours` — used by Ingestion to skip RSS items
 *  it has already turned into a Coverage on some earlier pass. Bounded, not the whole table's
 *  history — see findAllSeedUrls (docs/audit.md P0-2, ticket 03). */
export async function findAllArticleUrls(sinceHours: number): Promise<string[]> {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000)
  const rows = await prisma.coverage.findMany({
    where: { createdAt: { gte: since } },
    select: { articleUrl: true },
  })
  return rows.map((r) => r.articleUrl)
}
