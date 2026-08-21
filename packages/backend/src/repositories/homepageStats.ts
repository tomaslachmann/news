import { Prisma } from '@prisma/client'
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

function numberFromBigInt(value: bigint | number | null): number {
  if (value === null) return 0
  return typeof value === 'bigint' ? Number(value) : value
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
