import { Prisma } from '@prisma/client'
import type { Analysis, AnalysisStatus, Story, SynthesisResult } from '@prisma/client'
import { prisma } from '../db.js'
import type { CoverageWithSource } from './coverage.js'
import type { Cursor } from '../pagination.js'

export type { Analysis, AnalysisStatus }

export type AnalysisWithDetails = Analysis & {
  coverages: CoverageWithSource[]
  synthesisResult: SynthesisResult | null
}

export type AnalysisWithStory = Analysis & { story: Story }

/** Creates the Analysis and its Story together — a Story is always created alongside its
 *  Analysis, anchored to the same seed headline, per ADR 0017. Accepts an optional embedding
 *  (ticket 27) so a human-seeded Story can participate in the same matching pool Ingestion's
 *  own Stories already do — before ticket 27 this was always omitted, which is why Ingestion
 *  could never recognize a human had already started investigating an event (ADR 0019).
 *  `embeddingModel`/`embeddingInputHash` are audit metadata (ADR 0025, P1-8) — null whenever
 *  `embedding` itself is omitted. */
export async function createAnalysis(data: {
  seedUrl: string
  seedHeadline: string
  embedding?: number[]
  embeddingModel?: string
  embeddingInputHash?: string
}): Promise<Analysis> {
  return prisma.analysis.create({
    data: {
      seedUrl: data.seedUrl,
      seedHeadline: data.seedHeadline,
      status: 'PENDING',
      story: {
        create: {
          anchorHeadline: data.seedHeadline,
          embedding: data.embedding ?? [],
          embeddingModel: data.embeddingModel,
          embeddingInputHash: data.embeddingInputHash,
        },
      },
    },
  })
}

export async function createDraftAnalysis(data: {
  seedUrl: string
  seedHeadline: string
  embedding?: number[]
  embeddingModel?: string
  embeddingInputHash?: string
}): Promise<Analysis> {
  return prisma.analysis.create({
    data: {
      seedUrl: data.seedUrl,
      seedHeadline: data.seedHeadline,
      status: 'DRAFT',
      story: {
        create: {
          anchorHeadline: data.seedHeadline,
          embedding: data.embedding ?? [],
          embeddingModel: data.embeddingModel,
          embeddingInputHash: data.embeddingInputHash,
        },
      },
    },
  })
}

export async function findAnalysisWithStory(id: string): Promise<AnalysisWithStory | null> {
  return prisma.analysis.findUnique({ where: { id }, include: { story: true } })
}

export interface RecentStoryCandidate {
  storyId: string
  analysisId: string
  analysisStatus: AnalysisStatus
  embedding: number[]
  createdAt: Date
  anchorHeadline: string
  headline: string | null
}

/** Every Story whose Analysis was created within `sinceHours`, with its embedding — the
 *  candidate pool Ingestion's cheap matching scores a new RSS item against, and (ticket 27)
 *  human-seeded submission's own dedup check scores a new seed against. Includes every
 *  Analysis status (not just DRAFT/PENDING): a match against a COMPLETE Analysis still needs
 *  surfacing as a possible addition, and a match against FAILED must still be recognized as
 *  already-seen so it isn't recreated on the next poll. See ADR 0018. */
export async function findRecentStoriesForMatching(sinceHours: number): Promise<RecentStoryCandidate[]> {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000)
  const rows = await prisma.story.findMany({
    where: { analysis: { createdAt: { gte: since } } },
    include: {
      analysis: {
        select: { id: true, status: true, createdAt: true, synthesisResult: { select: { headline: true } } },
      },
    },
  })

  return rows
    .filter((r): r is typeof r & { analysis: NonNullable<(typeof r)['analysis']> } => r.analysis !== null)
    .map((r) => ({
      storyId: r.id,
      analysisId: r.analysis.id,
      analysisStatus: r.analysis.status,
      embedding: r.embedding,
      createdAt: r.analysis.createdAt,
      anchorHeadline: r.anchorHeadline,
      headline: r.analysis.synthesisResult?.headline ?? null,
    }))
}

/** Every Seed Article URL from the last `sinceHours` — used by Ingestion alongside
 *  findAllArticleUrls to skip RSS items it has already turned into an Analysis. Bounded, not
 *  the whole table's history: a URL genuinely re-published weeks ago realistically never
 *  reappears in a 20-minute RSS poll, and this query ran unbounded on every single poll
 *  (docs/audit.md P0-2, ticket 03). */
export async function findAllSeedUrls(sinceHours: number): Promise<string[]> {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000)
  const rows = await prisma.analysis.findMany({
    where: { createdAt: { gte: since } },
    select: { seedUrl: true },
  })
  return rows.map((r) => r.seedUrl)
}

export async function findAnalysisById(id: string): Promise<Analysis | null> {
  return prisma.analysis.findUnique({ where: { id } })
}

export async function findAnalysisWithDetails(id: string): Promise<AnalysisWithDetails | null> {
  return prisma.analysis.findUnique({
    where: { id },
    include: {
      coverages: {
        where: { excluded: false },
        orderBy: { id: 'asc' },
        include: { source: { select: { name: true } } },
      },
      synthesisResult: true,
    },
  })
}

/** Row-tuple comparison, not a plain `createdAt <` — stable across inserts that land exactly on
 *  the boundary timestamp (keyset pagination, docs/audit.md P0-7, ticket 03). */
function cursorWhere(cursor: Cursor | undefined): Prisma.AnalysisWhereInput {
  if (!cursor) return {}
  return {
    OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
  }
}

export interface AnalysisListRow {
  id: string
  seedHeadline: string
  headline: string | null
  createdAt: Date
  status: AnalysisStatus
  okCoverageCount: number
}

/** Fetches `limit + 1` rows (the caller peels off the extra one to know whether a next page
 *  exists — see `pagination.ts`'s `splitPage`). Admins see every status; everyone else only
 *  COMPLETE. */
export async function findAnalysesPage(
  includeAllStatuses: boolean,
  cursor: Cursor | undefined,
  limit: number
): Promise<AnalysisListRow[]> {
  const rows = await prisma.analysis.findMany({
    where: {
      ...(includeAllStatuses ? {} : { status: 'COMPLETE' }),
      ...cursorWhere(cursor),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: {
      _count: { select: { coverages: { where: { status: 'OK', excluded: false } } } },
      synthesisResult: { select: { headline: true } },
    },
  })

  return rows.map((r) => ({
    id: r.id,
    seedHeadline: r.seedHeadline,
    headline: r.synthesisResult?.headline ?? null,
    createdAt: r.createdAt,
    status: r.status,
    okCoverageCount: r._count.coverages,
  }))
}

export interface DraftListRow {
  id: string
  seedHeadline: string
  headline: string | null
  createdAt: Date
  coverageCount: number
}

/** DRAFT Analyses with at least `minVisibleSourceCount` attached (non-excluded) Coverage —
 *  raw SQL because the visibility threshold has to be a `HAVING` clause (filtering on the
 *  aggregated count), which Prisma's query builder can't express; pushing it into the query
 *  itself (rather than fetching everything and filtering in JS, as before) is what makes cursor
 *  pagination here return a consistent page size (ticket 03). Deliberately every Coverage
 *  status, not just OK, like `findAnalysesPage`'s `okCoverageCount`: a Draft's Coverage is
 *  always PENDING (nothing is scraped until Review Step confirmation after approval), so an
 *  OK-only count would always read zero here. */
export async function findDraftsPage(
  minVisibleSourceCount: number,
  cursor: Cursor | undefined,
  limit: number
): Promise<DraftListRow[]> {
  const rows = await prisma.$queryRaw<
    { id: string; seedHeadline: string; headline: string | null; createdAt: Date; coverageCount: bigint }[]
  >`
    SELECT a.id, a."seedHeadline", sr.headline, a."createdAt",
           count(c.id) FILTER (WHERE c.excluded = false) AS "coverageCount"
    FROM "Analysis" a
    LEFT JOIN "SynthesisResult" sr ON sr."analysisId" = a.id
    LEFT JOIN "Coverage" c ON c."analysisId" = a.id
    WHERE a.status = 'DRAFT'
      ${
        cursor
          ? Prisma.sql`AND (a."createdAt" < ${cursor.createdAt} OR (a."createdAt" = ${cursor.createdAt} AND a.id < ${cursor.id}))`
          : Prisma.empty
      }
    GROUP BY a.id, sr.headline
    HAVING count(c.id) FILTER (WHERE c.excluded = false) >= ${minVisibleSourceCount}
    ORDER BY a."createdAt" DESC, a.id DESC
    LIMIT ${limit + 1}
  `

  return rows.map((r) => ({ ...r, coverageCount: Number(r.coverageCount) }))
}

export async function updateAnalysisStatus(id: string, status: AnalysisStatus): Promise<void> {
  await prisma.analysis.update({ where: { id }, data: { status } })
}

/** Backdates/postdates an Analysis's createdAt — real code never does this; it exists for
 *  integration tests that need deterministic keyset-pagination ordering (ticket 03) without
 *  relying on wall-clock creation order, which a shared test database can't guarantee. */
export async function setAnalysisCreatedAtForTesting(id: string, createdAt: Date): Promise<void> {
  await prisma.analysis.update({ where: { id }, data: { createdAt } })
}

/** Like updateAnalysisStatus, but only writes if the row is still `fromStatus` — returns
 *  whether the transition actually happened. Used after a slow async gap (e.g. LLM
 *  verification) to avoid clobbering a status change (like a concurrent rejection) that landed
 *  in the meantime. See ticket 24.
 *
 *  `onTransition`, when the transition actually happens, runs inside the same transaction as the
 *  status write (ADR 0028: "vytvoř Draft a naplánuj jeho zpracování" is one atomic step) — used
 *  by approveDraft (ticket 14) to enqueue the `entity.extract` job atomically with the DRAFT→
 *  PENDING transition, so a queue failure rolls back the transition instead of leaving a Draft
 *  stuck in PENDING with no job ever enqueued for it. */
export async function updateAnalysisStatusIfCurrently(
  id: string,
  fromStatus: AnalysisStatus,
  toStatus: AnalysisStatus,
  onTransition?: (tx: Prisma.TransactionClient) => Promise<void>
): Promise<boolean> {
  return prisma.$transaction(
    async (tx) => {
      const result = await tx.analysis.updateMany({
        where: { id, status: fromStatus },
        data: { status: toStatus },
      })
      if (result.count === 0) return false
      await onTransition?.(tx)
      return true
    },
    // A generous margin over Prisma's 5s default: onTransition can enqueue a pg-boss job, and
    // getQueueClient()'s one-time cold start (schema setup + declaring every queue) risks blowing
    // the default interactive-transaction timeout on the very first call after a (re)deploy. The
    // API process pre-warms the queue client at startup (index.ts) specifically to avoid paying
    // that cost inside a transaction at all — this is a defensive margin, not the primary fix.
    { timeout: 10_000 }
  )
}

/** Closes the underlying Prisma connection pool — for test teardown only. */
export async function disconnect(): Promise<void> {
  await prisma.$disconnect()
}

/** Persists the Synthesis result and the tool-authored headline (see ADR 0021) and flips the
 *  Analysis to COMPLETE, all in one transaction — there is never a window where an Analysis is
 *  COMPLETE without its headline already having been generated. `headline` is null when
 *  generation was skipped because the Agreement dimension was empty. */
export async function completeAnalysisWithSynthesis(
  analysisId: string,
  dimensions: Prisma.InputJsonValue,
  headline: string | null
): Promise<void> {
  await prisma.$transaction([
    prisma.synthesisResult.upsert({
      where: { analysisId },
      create: { analysisId, dimensions, headline },
      update: { dimensions, headline },
    }),
    prisma.analysis.update({ where: { id: analysisId }, data: { status: 'COMPLETE' } }),
  ])
}
