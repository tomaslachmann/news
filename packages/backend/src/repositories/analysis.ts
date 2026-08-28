import { Prisma } from '@prisma/client'
import type {
  Analysis,
  AnalysisStatus,
  ArticleCategory,
  Story,
  SynthesisResult,
  SynthesisAgreementCategory,
  NarrativeImage,
} from '@prisma/client'
import type { AnalysisDimensions } from '@news-triangulator/shared'
import { prisma } from '../db.js'
import type { CoverageStatus, CoverageWithSource } from './coverage.js'
import type { Cursor } from '../pagination.js'
import { keysetSqlWhere } from './sqlPagination.js'

export type { Analysis, AnalysisStatus }

export type AnalysisWithDetails = Analysis & {
  coverages: CoverageWithSource[]
  synthesisResult: (SynthesisResult & { narrativeImage: NarrativeImage | null }) | null
}

export type AnalysisWithStory = Analysis & { story: Story }

/** Creates the Analysis and its Story together — a Story is always created alongside its
 *  Analysis, anchored to the same seed headline, per ADR 0017. Accepts an optional embedding
 *  (ticket 27) so a human-seeded Story can participate in the same matching pool Ingestion's
 *  own Stories already do — before ticket 27 this was always omitted, which is why Ingestion
 *  could never recognize a human had already started investigating an event (ADR 0019).
 *  `embeddingModel`/`embeddingInputHash` are audit metadata (ADR 0025, P1-8) — null whenever
 *  `embedding` itself is omitted; `eventTime` (ADR 0029, ticket 16) is null whenever the caller
 *  has no real event-time signal to offer, same nullable-no-default convention. */
export async function createAnalysis(data: {
  seedUrl: string
  seedHeadline: string
  eventTime?: Date
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
          eventTime: data.eventTime,
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
  eventTime?: Date
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
          eventTime: data.eventTime,
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
      synthesisResult: { include: { narrativeImage: true } },
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
  coverages: { status: CoverageStatus; extractionResult: unknown; sourceName: string }[]
  dimensions: AnalysisDimensions | null
  sourceOverlapPercentage: number | null
  leadImage: {
    imageUrl: string
    thumbnailUrl: string | null
    author: string | null
    license: string | null
    sourceUrl: string
  } | null
  entityNames: string[]
}

/** The `include` shape every `AnalysisListRow` consumer needs — shared so `findAnalysesPage` and
 *  `homepageArticles.ts`'s `findHomepageArticleRows` (ticket 62 / ADR 0037) can't silently drift
 *  apart on what a "list row" actually selects. A change here (a new field, a different
 *  OK-coverage filter, a different story-entities take/orderBy) changes both call sites at once,
 *  which is exactly the point — the two features must not develop competing definitions of the
 *  same conceptual row. */
export const ANALYSIS_LIST_ROW_INCLUDE = {
  _count: { select: { coverages: { where: { status: 'OK', excluded: false } } } },
  coverages: {
    where: { status: 'OK', excluded: false },
    orderBy: { id: 'asc' },
    select: {
      status: true,
      extractionResult: true,
      source: { select: { name: true } },
    },
  },
  story: {
    select: {
      storyEntities: {
        orderBy: [{ salience: 'desc' }, { entityId: 'asc' }],
        take: 4,
        select: { entity: { select: { canonicalName: true } } },
      },
    },
  },
  synthesisResult: {
    select: {
      headline: true,
      dimensions: true,
      sourceOverlapPercentage: true,
      narrativeImage: {
        select: {
          imageUrl: true,
          thumbnailUrl: true,
          author: true,
          license: true,
          sourceUrl: true,
        },
      },
    },
  },
} satisfies Prisma.AnalysisInclude

type AnalysisListRowSource = Prisma.AnalysisGetPayload<{ include: typeof ANALYSIS_LIST_ROW_INCLUDE }>

/** Projects a raw Prisma row (queried with `ANALYSIS_LIST_ROW_INCLUDE`) into the shared
 *  `AnalysisListRow` shape — the other half of the "don't duplicate the list-row query" pairing
 *  above. */
export function toAnalysisListRow(r: AnalysisListRowSource): AnalysisListRow {
  return {
    id: r.id,
    seedHeadline: r.seedHeadline,
    headline: r.synthesisResult?.headline ?? null,
    createdAt: r.createdAt,
    status: r.status,
    okCoverageCount: r._count.coverages,
    coverages: r.coverages.map((coverage) => ({
      status: coverage.status,
      extractionResult: coverage.extractionResult,
      sourceName: coverage.source.name,
    })),
    dimensions: (r.synthesisResult?.dimensions as AnalysisDimensions | null) ?? null,
    sourceOverlapPercentage: r.synthesisResult?.sourceOverlapPercentage ?? null,
    leadImage: r.synthesisResult?.narrativeImage ?? null,
    entityNames: r.story.storyEntities.map((storyEntity) => storyEntity.entity.canonicalName),
  }
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
    include: ANALYSIS_LIST_ROW_INCLUDE,
  })

  return rows.map(toAnalysisListRow)
}

/** COMPLETE Analyses whose Story-level derived category (ticket 78, ticket 80) matches
 *  `category` — the mode of the Story's (OK, non-excluded) Coverages' `primaryCategory`, tied
 *  broken by the earliest-attached Coverage. That's exactly what `resolveStoryPrimaryCategory`
 *  (mappers/coverage.ts) computes for an already-loaded Story, but the filtering/pagination here
 *  needs to happen at the DB level, so the same rule is expressed as a per-row `LATERAL`-style
 *  subquery instead — kept in sync with `resolveStoryPrimaryCategory` by hand, same convention as
 *  this file's own `findDraftsPage` raw-SQL `HAVING` clause (ticket 49). Only the matching page of
 *  ids is found this way; the actual `AnalysisListRow` shape is then fetched through the same
 *  `ANALYSIS_LIST_ROW_INCLUDE`/`toAnalysisListRow` pairing `findAnalysesPage` uses, re-sorted back
 *  into the id order the raw query determined (Prisma's `id: { in }` doesn't preserve it) — so a
 *  category-browse row looks and behaves exactly like an `/articles`/`/history` row. */
export async function findAnalysesByCategoryPage(
  category: ArticleCategory,
  cursor: Cursor | undefined,
  limit: number
): Promise<AnalysisListRow[]> {
  const idRows = await prisma.$queryRaw<{ id: string; createdAt: Date }[]>`
    SELECT a.id, a."createdAt"
    FROM "Analysis" a
    WHERE a.status = 'COMPLETE'
      ${keysetSqlWhere(cursor)}
      AND (
        SELECT c."primaryCategory"
        FROM "Coverage" c
        WHERE c."analysisId" = a.id AND c.status = 'OK' AND c.excluded = false
          AND c."primaryCategory" IS NOT NULL
        GROUP BY c."primaryCategory"
        ORDER BY count(*) DESC, min(c."createdAt") ASC
        LIMIT 1
      ) = ${category}::"ArticleCategory"
    ORDER BY a."createdAt" DESC, a.id DESC
    LIMIT ${limit + 1}
  `
  if (idRows.length === 0) return []

  const rows = await prisma.analysis.findMany({
    where: { id: { in: idRows.map((r) => r.id) } },
    include: ANALYSIS_LIST_ROW_INCLUDE,
  })
  const byId = new Map(rows.map((r) => [r.id, r]))
  // Same defensive gap-tolerance as homepageStats.ts's own raw-SQL-ids-then-findMany pattern
  // (findHomepageMostReadRows) — a freak state where the second query is missing an id the first
  // one found (e.g. a concurrent delete between the two queries) degrades to skipping that one
  // row, never a 500 on this public endpoint.
  return idRows
    .map((idRow) => byId.get(idRow.id))
    .filter((row): row is NonNullable<typeof row> => row !== undefined)
    .map(toAnalysisListRow)
}

/** Public content search (ticket 83) — ranked (`ts_rank`) COMPLETE Analyses whose
 *  `SynthesisResult.searchVector` (a DB-generated `tsvector` over `searchText` — see
 *  `buildSearchText`, services/searchIndexing.ts) matches `query`. A bounded top-`limit` list, not
 *  keyset-paginated: a relevance ranking doesn't compose with "load more" the way a newest-first
 *  feed does (ticket's own Answer). Same two-step "raw SQL finds the ranked ids, then hydrate
 *  through the existing `ANALYSIS_LIST_ROW_INCLUDE`/`toAnalysisListRow` pairing, gap-tolerant"
 *  pattern `findAnalysesByCategoryPage` above already established, so a search result row looks
 *  and behaves exactly like `/articles`/`/category/:slug`. */
export async function findAnalysesBySearch(query: string, limit: number): Promise<AnalysisListRow[]> {
  const idRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT a.id
    FROM "Analysis" a
    JOIN "SynthesisResult" sr ON sr."analysisId" = a.id
    WHERE a.status = 'COMPLETE'
      AND sr."searchVector" @@ plainto_tsquery('simple', ${query})
    ORDER BY ts_rank(sr."searchVector", plainto_tsquery('simple', ${query})) DESC
    LIMIT ${limit}
  `
  if (idRows.length === 0) return []

  const rows = await prisma.analysis.findMany({
    where: { id: { in: idRows.map((r) => r.id) } },
    include: ANALYSIS_LIST_ROW_INCLUDE,
  })
  const byId = new Map(rows.map((r) => [r.id, r]))
  return idRows
    .map((idRow) => byId.get(idRow.id))
    .filter((row): row is NonNullable<typeof row> => row !== undefined)
    .map(toAnalysisListRow)
}

export interface DraftListRow {
  id: string
  seedHeadline: string
  headline: string | null
  createdAt: Date
  coverageCount: number
}

export interface DraftsPageQuery {
  minVisibleSourceCount: number
  offset: number
  limit: number
  /** Column to order by. Default `createdAt`. */
  sort?: 'createdAt' | 'coverageCount'
  /** Order direction. Default `desc`. */
  dir?: 'asc' | 'desc'
  /** Case-insensitive substring match against an attached (non-excluded) Coverage's Source name. */
  outlet?: string
  createdAfter?: Date
  createdBefore?: Date
}

/** DRAFT Analyses with at least `minVisibleSourceCount` attached (non-excluded) Coverage —
 *  raw SQL because the visibility threshold has to be a `HAVING` clause (filtering on the
 *  aggregated count), which Prisma's query builder can't express; pushing it into the query
 *  itself (rather than fetching everything and filtering in JS, as before) is what keeps a
 *  page's size consistent (ticket 03). Deliberately every Coverage status, not just OK, like
 *  `findAnalysesPage`'s `okCoverageCount`: a Draft's Coverage is always PENDING (nothing is
 *  scraped until Review Step confirmation after approval), so an OK-only count would always read
 *  zero here.
 *
 *  Offset-paginated with a real `total` (ticket 88): unlike the public feeds, this is a bounded
 *  admin queue that needs jump-to-page and a count. `sort`/`dir`/`outlet`/date-range are all
 *  optional server-side controls for an Admin triaging the queue; every dynamic fragment is a
 *  `Prisma.sql` value (parameterised or a fixed keyword literal), never interpolated input. */
export async function findDraftsPage(q: DraftsPageQuery): Promise<{ rows: DraftListRow[]; total: number }> {
  const filters: Prisma.Sql[] = [Prisma.sql`a.status = 'DRAFT'`]
  if (q.createdAfter) filters.push(Prisma.sql`a."createdAt" >= ${q.createdAfter}`)
  if (q.createdBefore) filters.push(Prisma.sql`a."createdAt" <= ${q.createdBefore}`)
  if (q.outlet) {
    filters.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "Coverage" oc
      JOIN "Source" os ON os.id = oc."sourceId"
      WHERE oc."analysisId" = a.id AND oc.excluded = false
        AND os.name ILIKE '%' || ${q.outlet} || '%'
    )`)
  }
  const where = Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}`
  const having = Prisma.sql`HAVING count(c.id) FILTER (WHERE c.excluded = false) >= ${q.minVisibleSourceCount}`

  // `dirSql` is a fixed keyword literal chosen here, never interpolated input. When sorting by
  // coverageCount the tiebreaker stays newest-first regardless of `dir` (equal-count Drafts read
  // best most-recent-first either way); the createdAt sort's tiebreaker follows `dir` so a full
  // page reversal is a clean mirror.
  const dirSql = q.dir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`
  const orderBy =
    q.sort === 'coverageCount'
      ? Prisma.sql`ORDER BY "coverageCount" ${dirSql}, a."createdAt" DESC, a.id DESC`
      : Prisma.sql`ORDER BY a."createdAt" ${dirSql}, a.id ${dirSql}`

  const rows = await prisma.$queryRaw<
    { id: string; seedHeadline: string; headline: string | null; createdAt: Date; coverageCount: bigint }[]
  >`
    SELECT a.id, a."seedHeadline", sr.headline, a."createdAt",
           count(c.id) FILTER (WHERE c.excluded = false) AS "coverageCount"
    FROM "Analysis" a
    LEFT JOIN "SynthesisResult" sr ON sr."analysisId" = a.id
    LEFT JOIN "Coverage" c ON c."analysisId" = a.id
    ${where}
    GROUP BY a.id, sr.headline
    ${having}
    ${orderBy}
    LIMIT ${q.limit} OFFSET ${q.offset}
  `

  const totalRows = await prisma.$queryRaw<{ total: number }[]>`
    SELECT count(*)::int AS total FROM (
      SELECT a.id
      FROM "Analysis" a
      LEFT JOIN "Coverage" c ON c."analysisId" = a.id
      ${where}
      GROUP BY a.id
      ${having}
    ) sub
  `

  return {
    rows: rows.map((r) => ({ ...r, coverageCount: Number(r.coverageCount) })),
    total: totalRows[0]?.total ?? 0,
  }
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

export interface CompleteAnalysisWithSynthesisOptions {
  /** Null when generation was skipped because the Agreement dimension was empty. */
  headline: string | null
  /** Ticket 38 / ADR 0030 — derived by `computeSourceOverlapPercentage`. */
  sourceOverlapPercentage: number | null
  /** Ticket 38 / ADR 0030 — lifted straight off the already-validated `SynthesisResult` the model
   *  returned. */
  agreementCategory: SynthesisAgreementCategory
  /** Ticket 83 — `buildSearchText` (services/searchIndexing.ts)'s flattened plain-text output.
   *  Computed by the caller, not here: this repository layer stays pure data access (ADR 0010),
   *  the same reason `sourceOverlapPercentage` above is already computed upstream rather than
   *  derived inline. */
  searchText: string
  /** Runs inside the same transaction as the writes below (ADR 0028: "vytvoř Draft a naplánuj
   *  jeho zpracování" is one atomic step) — used by `analysisStream.ts` to enqueue the
   *  `narrative.generate` job (ticket 15) atomically with the COMPLETE transition, so a queue
   *  failure rolls the transition back instead of leaving a COMPLETE Analysis with no job ever
   *  enqueued for it. Same seam `updateAnalysisStatusIfCurrently` already established for ticket
   *  14's `entity.extract` enqueue — keeps job-queue concerns out of the repository layer. */
  onComplete?: (tx: Prisma.TransactionClient) => Promise<void>
}

/** Persists the Synthesis result and the tool-authored headline (see ADR 0021) and flips the
 *  Analysis to COMPLETE, all in one transaction — there is never a window where an Analysis is
 *  COMPLETE without its headline already having been generated. Takes an options object (rather
 *  than positional params) because this field set has grown once already (ticket 38) and will
 *  again — an options bag makes the next addition additive at every call site instead of a
 *  positional insertion that risks transposing two same-typed neighbors. */
export async function completeAnalysisWithSynthesis(
  analysisId: string,
  dimensions: Prisma.InputJsonValue,
  {
    headline,
    sourceOverlapPercentage,
    agreementCategory,
    searchText,
    onComplete,
  }: CompleteAnalysisWithSynthesisOptions
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.synthesisResult.upsert({
        where: { analysisId },
        create: { analysisId, dimensions, headline, sourceOverlapPercentage, agreementCategory, searchText },
        update: { dimensions, headline, sourceOverlapPercentage, agreementCategory, searchText },
      })
      await tx.analysis.update({ where: { id: analysisId }, data: { status: 'COMPLETE' } })
      await onComplete?.(tx)
    },
    // Same generous margin as updateAnalysisStatusIfCurrently, for the same reason: onComplete
    // can enqueue a pg-boss job, and getQueueClient()'s one-time cold start risks blowing the
    // default interactive-transaction timeout on the very first call after a (re)deploy.
    { timeout: 10_000 }
  )
}
