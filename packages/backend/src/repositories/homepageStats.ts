import { Prisma } from '@prisma/client'
import { prisma } from '../db.js'

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
}: ComputeHomepageEntityStatsInput): Promise<HomepageEntityStatComputedRow[]> {
  const rows = await prisma.$queryRaw<HomepageEntityStatRawRow[]>`
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
}): Promise<string> {
  const snapshot = await prisma.$transaction(async (tx) => {
    const created = await tx.homepageEntityStatSnapshot.create({
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

    const keepLatestIds = await tx.homepageEntityStatSnapshot.findMany({
      orderBy: { computedAt: 'desc' },
      take: 5,
      select: { id: true },
    })
    await tx.homepageEntityStatSnapshot.deleteMany({
      where: { id: { notIn: keepLatestIds.map((row) => row.id) } },
    })

    return created
  })

  return snapshot.id
}

export async function findLatestHomepageEntityStats(): Promise<HomepageEntityStatStoredRow[]> {
  const snapshot = await prisma.homepageEntityStatSnapshot.findFirst({
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

export async function withHomepageStatsAdvisoryLock<T>(fn: () => Promise<T>): Promise<T | null> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtext('homepage.entity-stats.refresh')) AS locked
      `
      if (!rows[0]?.locked) return null
      return fn()
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 60_000 }
  )
}
