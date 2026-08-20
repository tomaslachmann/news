import type { Thread, ThreadRole } from '@prisma/client'
import { prisma } from '../db.js'

export type { Thread, ThreadRole }

export interface ThreadComponentMember {
  storyId: string
  eventTime: Date
}

/** The full `PUBLISHED`/`FOLLOW_UP`-connected component containing `seedStoryId`, via the
 *  audit's own recursive CTE (§8.6, docs/audit.md) — `UNION` (not `UNION ALL`) dedupes cycles, or
 *  the recursion never terminates; `depth < 50` is a pathological-graph safeguard, not a real
 *  arc-length limit. Ordered oldest-first by `eventTime` (falling back to `createdAt` for a Story
 *  with none, ticket 16 — `COALESCE`, never a bare column) — position 0 is always the earliest
 *  member. Includes `seedStoryId` itself even when it has no edges at all (a single-row
 *  component); the caller (`threadRecomputeJob.ts`) is what decides a lone Story isn't a Thread. */
export async function findFollowUpComponent(seedStoryId: string): Promise<ThreadComponentMember[]> {
  const rows = await prisma.$queryRaw<{ storyId: string; eventTime: Date }[]>`
    WITH RECURSIVE component AS (
      SELECT ${seedStoryId}::text AS story_id, 0 AS depth
      UNION
      SELECT CASE WHEN r."fromStoryId" = c.story_id THEN r."toStoryId" ELSE r."fromStoryId" END,
             c.depth + 1
      FROM component c
      JOIN "StoryRelation" r ON (r."fromStoryId" = c.story_id OR r."toStoryId" = c.story_id)
      WHERE r.status = 'PUBLISHED' AND r.type = 'FOLLOW_UP' AND c.depth < 50
    )
    SELECT s.id AS "storyId", COALESCE(s."eventTime", s."createdAt") AS "eventTime"
    FROM (SELECT DISTINCT story_id FROM component) c
    JOIN "Story" s ON s.id = c.story_id
    ORDER BY COALESCE(s."eventTime", s."createdAt")
  `
  return rows
}

export interface StoryAgreementForTitle {
  storyId: string
  /** Fallback title if every member's Agreement turns out empty — see threadRecomputeJob.ts. */
  displayTitle: string
  agreementProse: string[]
}

/** Each member's own `SynthesisResult.dimensions.agreement` prose, flattened for
 *  `runThreadTitlePass` — and each member's own resolved display title (`headline ??
 *  seedHeadline`), for the empty-Agreement-everywhere fallback. Only ever called once, when a
 *  Thread is about to be created (see threadRecomputeJob.ts) — an existing Thread's title is
 *  never regenerated as new members join. A member whose Analysis or SynthesisResult somehow
 *  doesn't exist (shouldn't happen — every Story is created with an Analysis in the same
 *  transaction, ADR 0017) is skipped rather than breaking title derivation for the rest. */
export async function findAgreementForTitle(storyIds: string[]): Promise<StoryAgreementForTitle[]> {
  const stories = await prisma.story.findMany({
    where: { id: { in: storyIds } },
    include: { analysis: { include: { synthesisResult: { select: { dimensions: true, headline: true } } } } },
  })

  const result: StoryAgreementForTitle[] = []
  for (const s of stories) {
    if (!s.analysis) continue
    const dimensions = s.analysis.synthesisResult?.dimensions as
      { agreement?: { prose: string }[] } | undefined
    result.push({
      storyId: s.id,
      displayTitle: s.analysis.synthesisResult?.headline ?? s.analysis.seedHeadline,
      agreementProse: (dimensions?.agreement ?? []).map((item) => item.prose),
    })
  }
  return result
}

export interface UpsertThreadMemberInput {
  storyId: string
  position: number
  role: ThreadRole
}

/** Finds the Thread any of `members` already belongs to, or creates one (using `createIfMissing`
 *  — computed by the caller *before* this call, since deriving a title is a slow LLM call that
 *  must never run inside a DB transaction), then wholesale-replaces its ThreadMember rows and
 *  updates its span/status — all in one transaction, so a `thread.recompute` retry (pg-boss,
 *  `THREAD_RECOMPUTE_RETRY_POLICY`) never observes or leaves a half-updated Thread.
 *
 *  Idempotent by construction, not by an advisory lock: `ThreadMember.storyId` is `@unique`, so
 *  two concurrent recomputes whose components overlap can race to create two different Threads
 *  for the same Story — the second transaction to commit fails its unique constraint, throws, and
 *  pg-boss retries it; the retry's own existence check now finds the Thread the first transaction
 *  already created and joins it instead. See ticket 17's Answer — deliberately not locked, the
 *  same "retry self-heals, don't hand-roll coordination for a narrow race" judgment ticket 14 made
 *  for `entity.extract`'s own idempotency.
 *
 *  Status never auto-leaves CLOSED: a Thread an Admin manually closed (ticket 17's Answer, Q4 —
 *  no admin surface ships yet, but the state itself is already reachable at the schema level)
 *  keeps accumulating members/span updates on later recomputes without silently reopening. */
export async function upsertThreadFromComponent(
  members: UpsertThreadMemberInput[],
  span: { firstEventAt: Date; lastEventAt: Date },
  createIfMissing: { title: string; slug: string }
): Promise<Thread> {
  return prisma.$transaction(async (tx) => {
    const storyIds = members.map((m) => m.storyId)
    const existing = await tx.threadMember.findFirst({
      where: { storyId: { in: storyIds } },
      include: { thread: true },
    })

    const thread =
      existing?.thread ??
      (await tx.thread.create({
        data: {
          title: createIfMissing.title,
          slug: createIfMissing.slug,
          firstEventAt: span.firstEventAt,
          lastEventAt: span.lastEventAt,
        },
      }))

    await tx.threadMember.deleteMany({ where: { threadId: thread.id } })
    await tx.threadMember.createMany({
      data: members.map((m) => ({
        threadId: thread.id,
        storyId: m.storyId,
        position: m.position,
        role: m.role,
      })),
    })

    const daysSinceLast = (Date.now() - span.lastEventAt.getTime()) / (1000 * 60 * 60 * 24)
    const status = thread.status === 'CLOSED' ? 'CLOSED' : daysSinceLast > 30 ? 'DORMANT' : 'ACTIVE'

    return tx.thread.update({
      where: { id: thread.id },
      data: {
        status,
        firstEventAt: span.firstEventAt,
        lastEventAt: span.lastEventAt,
        memberCount: members.length,
      },
    })
  })
}

export interface ThreadMemberForReader {
  analysisId: string
  seedHeadline: string
  headline: string | null
  status: string
  position: number
}

export interface ThreadForReader {
  title: string
  memberCount: number
  members: ThreadMemberForReader[]
}

/** The Thread `storyId` belongs to, with every member's own Analysis id/title inputs/status —
 *  ticket 17's reader surface (see that ticket's Answer, Q3), the Article page's addition to
 *  ticket 37's existing Related Events section. `null` when this Story isn't in any Thread (the
 *  common case — most Stories never accumulate a FOLLOW_UP chain). Deliberately does not select
 *  `role` — see ticket 17's Answer, Q2 (presentation-only, not surfaced to the reader). A member
 *  whose Analysis somehow doesn't exist (see findAgreementForTitle's identical note) is skipped. */
export async function findThreadForStory(storyId: string): Promise<ThreadForReader | null> {
  const member = await prisma.threadMember.findUnique({ where: { storyId }, select: { threadId: true } })
  if (!member) return null

  const thread = await prisma.thread.findUnique({
    where: { id: member.threadId },
    include: {
      members: {
        orderBy: { position: 'asc' },
        include: {
          story: { include: { analysis: { include: { synthesisResult: { select: { headline: true } } } } } },
        },
      },
    },
  })
  if (!thread) return null

  const members: ThreadMemberForReader[] = []
  for (const m of thread.members) {
    if (!m.story.analysis) continue
    members.push({
      analysisId: m.story.analysis.id,
      seedHeadline: m.story.analysis.seedHeadline,
      headline: m.story.analysis.synthesisResult?.headline ?? null,
      status: m.story.analysis.status,
      position: m.position,
    })
  }

  return { title: thread.title, memberCount: thread.memberCount, members }
}

/** Sets a Thread's status directly — real code never does this (no `DORMANT → CLOSED` admin
 *  surface exists yet, ticket 17's Answer, Q4); exists for integration tests that need to
 *  exercise `upsertThreadFromComponent`'s "never auto-reopens a CLOSED Thread" behavior without
 *  that surface. Same convention as `setAnalysisCreatedAtForTesting` (repositories/analysis.ts). */
export async function setThreadStatusForTesting(threadId: string, status: Thread['status']): Promise<void> {
  await prisma.thread.update({ where: { id: threadId }, data: { status } })
}
