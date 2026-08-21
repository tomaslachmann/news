import { Prisma } from '@prisma/client'
import type { AnalysisDimensions } from '@news-triangulator/shared'
import { prisma } from '../db.js'

type HomepageStatsDbClient = Pick<Prisma.TransactionClient, '$queryRaw' | 'homepageEntityStatSnapshot'>

export interface ComputeHomepageEntityStatsInput {
  currentStart: Date
  currentEnd: Date
  previousStart: Date
  previousEnd: Date
  limit: number
}

export interface HomepageEntityStatComputedRow {
  entityId: string
  recentEventCount: number
  recentSourceCount: number
  previousEventCount: number
}

export interface HomepageEntityStatStoredRow {
  key: string
  canonicalName: string
  type: 'PERSON' | 'ORGANIZATION' | 'PLACE' | 'COUNTRY'
  recentEventCount: number
  recentSourceCount: number
  previousEventCount: number | null
}

interface HomepageEntityStatRawRow {
  entityId: string
  recentEventCount: bigint
  recentSourceCount: bigint
  previousEventCount: bigint | null
}

export interface HomepageSummaryStatsRow {
  processedArticleCount: number
  activeSourceCount: number
  contradictionCount: number
  averageSourceOverlapPercentage: number | null
}

interface HomepageSummaryStatsRawRow {
  processedArticleCount: bigint
  activeSourceCount: bigint
  contradictionCount: bigint
  averageSourceOverlapPercentage: number | null
}

export interface HomepageMinuteRow {
  id: string
  seedHeadline: string
  headline: string | null
  createdAt: Date
  sourceCount: number
  dimensions: AnalysisDimensions | null
}

export interface HomepageContradictionAnalysisRow {
  id: string
  seedHeadline: string
  headline: string | null
  createdAt: Date
  sourceOverlapPercentage: number | null
  dimensions: AnalysisDimensions | null
}

function numberFromBigInt(value: bigint | number | null): number {
  if (value === null) return 0
  return typeof value === 'bigint' ? Number(value) : value
}

export async function findHomepageSummaryStats(input: {
  windowStart: Date
  windowEnd: Date
}): Promise<HomepageSummaryStatsRow> {
  const rows = await prisma.$queryRaw<HomepageSummaryStatsRawRow[]>`
    WITH complete_articles AS (
      SELECT a.id
      FROM "Analysis" a
      WHERE a.status = 'COMPLETE'
        AND a."createdAt" >= ${input.windowStart}
        AND a."createdAt" < ${input.windowEnd}
    ),
    article_stats AS (
      SELECT
        COUNT(*) AS "processedArticleCount",
        COALESCE(
          SUM(jsonb_array_length(COALESCE(sr.dimensions::jsonb -> 'contradiction', '[]'::jsonb))),
          0
        ) AS "contradictionCount",
        (
          AVG(sr."sourceOverlapPercentage") FILTER (WHERE sr."sourceOverlapPercentage" IS NOT NULL)
        )::double precision
          AS "averageSourceOverlapPercentage"
      FROM complete_articles ca
      LEFT JOIN "SynthesisResult" sr ON sr."analysisId" = ca.id
    ),
    source_stats AS (
      SELECT COUNT(DISTINCT c."sourceId") AS "activeSourceCount"
      FROM complete_articles ca
      JOIN "Coverage" c
        ON c."analysisId" = ca.id
        AND c.status = 'OK'
        AND c.excluded = false
    )
    SELECT
      article_stats."processedArticleCount",
      source_stats."activeSourceCount",
      article_stats."contradictionCount",
      article_stats."averageSourceOverlapPercentage"
    FROM article_stats, source_stats
  `
  const row = rows[0]

  return {
    processedArticleCount: numberFromBigInt(row?.processedArticleCount ?? 0),
    activeSourceCount: numberFromBigInt(row?.activeSourceCount ?? 0),
    contradictionCount: numberFromBigInt(row?.contradictionCount ?? 0),
    averageSourceOverlapPercentage:
      row?.averageSourceOverlapPercentage == null ? null : Math.round(row.averageSourceOverlapPercentage),
  }
}

export async function findHomepageMinuteRows(limit: number): Promise<HomepageMinuteRow[]> {
  const rows = await prisma.analysis.findMany({
    where: { status: 'COMPLETE' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    include: {
      _count: { select: { coverages: { where: { status: 'OK', excluded: false } } } },
      synthesisResult: { select: { headline: true, dimensions: true } },
    },
  })

  return rows.map((row) => ({
    id: row.id,
    seedHeadline: row.seedHeadline,
    headline: row.synthesisResult?.headline ?? null,
    createdAt: row.createdAt,
    sourceCount: row._count.coverages,
    dimensions: (row.synthesisResult?.dimensions as AnalysisDimensions | null) ?? null,
  }))
}

export async function findHomepageContradictionAnalysisRows(input: {
  windowStart: Date
  windowEnd: Date
}): Promise<HomepageContradictionAnalysisRow[]> {
  const rows = await prisma.analysis.findMany({
    where: {
      status: 'COMPLETE',
      createdAt: { gte: input.windowStart, lt: input.windowEnd },
      synthesisResult: { isNot: null },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      synthesisResult: {
        select: {
          headline: true,
          dimensions: true,
          sourceOverlapPercentage: true,
        },
      },
    },
  })

  return rows.map((row) => ({
    id: row.id,
    seedHeadline: row.seedHeadline,
    headline: row.synthesisResult?.headline ?? null,
    createdAt: row.createdAt,
    sourceOverlapPercentage: row.synthesisResult?.sourceOverlapPercentage ?? null,
    dimensions: (row.synthesisResult?.dimensions as AnalysisDimensions | null) ?? null,
  }))
}

export async function computeHomepageEntityStats({
  currentStart,
  currentEnd,
  previousStart,
  previousEnd,
  limit,
  db = prisma,
}: ComputeHomepageEntityStatsInput & {
  db?: HomepageStatsDbClient
}): Promise<HomepageEntityStatComputedRow[]> {
  const rows = await db.$queryRaw<HomepageEntityStatRawRow[]>`
    WITH current_stats AS (
      SELECT
        se."entityId" AS "entityId",
        COUNT(DISTINCT a.id) AS "recentEventCount",
        COUNT(DISTINCT c."sourceId") FILTER (WHERE c.id IS NOT NULL) AS "recentSourceCount"
      FROM "Analysis" a
      JOIN "StoryEntity" se ON se."storyId" = a."storyId"
      LEFT JOIN "Coverage" c
        ON c."analysisId" = a.id
        AND c.status = 'OK'
        AND c.excluded = false
      WHERE a.status = 'COMPLETE'
        AND a."createdAt" >= ${currentStart}
        AND a."createdAt" < ${currentEnd}
      GROUP BY se."entityId"
    ),
    previous_stats AS (
      SELECT
        se."entityId" AS "entityId",
        COUNT(DISTINCT a.id) AS "previousEventCount"
      FROM "Analysis" a
      JOIN "StoryEntity" se ON se."storyId" = a."storyId"
      WHERE a.status = 'COMPLETE'
        AND a."createdAt" >= ${previousStart}
        AND a."createdAt" < ${previousEnd}
      GROUP BY se."entityId"
    )
    SELECT
      cs."entityId",
      cs."recentEventCount",
      cs."recentSourceCount",
      COALESCE(ps."previousEventCount", 0) AS "previousEventCount"
    FROM current_stats cs
    LEFT JOIN previous_stats ps ON ps."entityId" = cs."entityId"
    JOIN "Entity" e ON e.id = cs."entityId"
    ORDER BY cs."recentEventCount" DESC, cs."recentSourceCount" DESC, e."canonicalName" ASC, e.key ASC
    LIMIT ${limit}
  `

  return rows.map((row) => ({
    entityId: row.entityId,
    recentEventCount: numberFromBigInt(row.recentEventCount),
    recentSourceCount: numberFromBigInt(row.recentSourceCount),
    previousEventCount: numberFromBigInt(row.previousEventCount),
  }))
}

export async function replaceHomepageEntityStatSnapshot(input: {
  windowStart: Date
  windowEnd: Date
  items: HomepageEntityStatComputedRow[]
  db?: HomepageStatsDbClient
}): Promise<string> {
  if (!input.db) {
    return prisma.$transaction((tx) => replaceHomepageEntityStatSnapshot({ ...input, db: tx }))
  }

  const db = input.db ?? prisma
  const created = await db.homepageEntityStatSnapshot.create({
    data: {
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      items: {
        create: input.items.map((item, index) => ({
          entityId: item.entityId,
          rank: index + 1,
          recentEventCount: item.recentEventCount,
          recentSourceCount: item.recentSourceCount,
          previousEventCount: item.previousEventCount,
        })),
      },
    },
    select: { id: true },
  })

  const keepLatestIds = await db.homepageEntityStatSnapshot.findMany({
    orderBy: { computedAt: 'desc' },
    take: 5,
    select: { id: true },
  })
  await db.homepageEntityStatSnapshot.deleteMany({
    where: { id: { notIn: keepLatestIds.map((row) => row.id) } },
  })

  return created.id
}

export async function findLatestHomepageEntityStats(input: {
  minimumWindowEnd: Date
}): Promise<HomepageEntityStatStoredRow[]> {
  const snapshot = await prisma.homepageEntityStatSnapshot.findFirst({
    where: { windowEnd: { gte: input.minimumWindowEnd } },
    orderBy: { computedAt: 'desc' },
    select: {
      items: {
        orderBy: { rank: 'asc' },
        select: {
          recentEventCount: true,
          recentSourceCount: true,
          previousEventCount: true,
          entity: { select: { key: true, canonicalName: true, type: true } },
        },
      },
    },
  })

  return (
    snapshot?.items.map((item) => ({
      key: item.entity.key,
      canonicalName: item.entity.canonicalName,
      type: item.entity.type,
      recentEventCount: item.recentEventCount,
      recentSourceCount: item.recentSourceCount,
      previousEventCount: item.previousEventCount,
    })) ?? []
  )
}

export async function refreshHomepageEntityStatsSnapshot(input: {
  currentStart: Date
  currentEnd: Date
  previousStart: Date
  previousEnd: Date
  limit: number
}): Promise<{ snapshotId: string; itemCount: number } | null> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtext('homepage.entity-stats.refresh')) AS locked
      `
      if (!rows[0]?.locked) return null

      const items = await computeHomepageEntityStats({
        currentStart: input.currentStart,
        currentEnd: input.currentEnd,
        previousStart: input.previousStart,
        previousEnd: input.previousEnd,
        limit: input.limit,
        db: tx,
      })
      const snapshotId = await replaceHomepageEntityStatSnapshot({
        windowStart: input.currentStart,
        windowEnd: input.currentEnd,
        items,
        db: tx,
      })

      return { snapshotId, itemCount: items.length }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 60_000 }
  )
}
