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
  /** Raw inputs for the empty-Agreement-everywhere fallback title — resolved via the same
   *  `resolveDisplayTitle` (mappers/analysis.ts) every other title in the app uses, not a second
   *  copy of its fallback rule. See threadRecomputeJob.ts. */
  headline: string | null
  seedHeadline: string
  agreementProse: string[]
}

/** Each member's own `SynthesisResult.dimensions.agreement` prose, flattened for
 *  `runThreadTitlePass`, plus the raw `headline`/`seedHeadline` a fallback title resolves from
 *  when every member's Agreement turns out empty. Only ever called once, when a Thread is about
 *  to be created (see threadRecomputeJob.ts's existence pre-check) — an existing Thread's title
 *  is never regenerated as new members join. Returned in no particular order — Postgres doesn't
 *  preserve an `IN (...)` clause's input order — the caller re-sorts against its own
 *  eventTime-ordered member list before this feeds the LLM (chronology matters to the prompt).
 *  A member whose Analysis somehow doesn't exist (shouldn't happen — every Story is created with
 *  an Analysis in the same transaction, ADR 0017) is skipped rather than breaking title
 *  derivation for the rest. */
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
      headline: s.analysis.synthesisResult?.headline ?? null,
      seedHeadline: s.analysis.seedHeadline,
      agreementProse: (dimensions?.agreement ?? []).map((item) => item.prose),
    })
  }
  return result
}

/** Whether any of `storyIds` already belongs to a Thread — a cheap pre-check
 *  (`threadRecomputeJob.ts`) so a recompute of an already-existing Thread can skip
 *  `findAgreementForTitle`/`runThreadTitlePass` entirely (its title is never regenerated anyway,
 *  see `upsertThreadFromComponent`). Advisory only: `upsertThreadFromComponent`'s own transaction
 *  re-checks from scratch, so a stale answer here (a concurrent recompute creating a Thread
 *  between this call and the transaction) only costs a wasted LLM call, never correctness. */
export async function anyExistingThreadForStories(storyIds: string[]): Promise<boolean> {
  const count = await prisma.threadMember.count({ where: { storyId: { in: storyIds } } })
  return count > 0
}

export interface UpsertThreadMemberInput {
  storyId: string
  position: number
  role: ThreadRole
}

/** Finds the Thread(s) any of `members` already belong to, or creates one (using
 *  `createIfMissing` — computed by the caller *before* this call, since deriving a title is a
 *  slow LLM call that must never run inside a DB transaction), then wholesale-replaces its
 *  ThreadMember rows and updates its span/status — all in one transaction, so a `thread.recompute`
 *  retry (pg-boss, `THREAD_RECOMPUTE_RETRY_POLICY`) never observes or leaves a half-updated
 *  Thread.
 *
 *  **Merging two pre-existing Threads**: a newly-confirmed edge can bridge two Stories that
 *  already belong to two *different* Threads (two previously-separate arcs turning out to be one
 *  — `findFollowUpComponent` then returns the full union). The Thread with the earliest
 *  `firstEventAt` survives (keeps its own id/title/slug — the older arc's identity persists, the
 *  newer one folds into it); every other touched Thread's members are cleared and the now-empty
 *  Thread row itself is deleted. Without this, a naive "just pick one" would leave the
 *  non-selected Thread's members still uniquely claiming their `storyId`, and inserting them
 *  again under the survivor would crash on `ThreadMember.storyId`'s `@unique` constraint — every
 *  retry identically, since the conflict isn't transient.
 *
 *  **Early-exit**: if the freshly-computed membership/span already matches what's stored, skips
 *  the delete+recreate+update entirely — a duplicate `thread.recompute` for an unchanged
 *  component (deliberately not deduped at enqueue time, see ticket 17's Answer) becomes a cheap
 *  no-op instead of rewriting every ThreadMember row for nothing.
 *
 *  Idempotent by construction, not by an advisory lock: `ThreadMember.storyId` is `@unique`, so
 *  two concurrent recomputes whose components overlap can still race — the losing transaction
 *  fails its unique constraint, throws, and pg-boss retries it; the retry's own existence check
 *  now finds what the winner already created/merged and joins it instead. See ticket 17's Answer
 *  — deliberately not locked, the same "retry self-heals, don't hand-roll coordination for a
 *  narrow race" judgment ticket 14 made for `entity.extract`'s own idempotency.
 *
 *  Status never auto-leaves CLOSED: a Thread an Admin manually closed (ticket 17's Answer, Q4 —
 *  no admin surface ships yet, but the state itself is already reachable at the schema level)
 *  keeps accumulating members/span updates on later recomputes without silently reopening.
 *
 *  `changed: false` on the early-exit path above lets `threadRecomputeJob.ts` (ticket 67/74) skip
 *  chaining a real, billed LLM call (`thread.synthesizeOpenQuestions`) off a duplicate recompute
 *  that did no work — without this, the "a duplicate `thread.recompute` for an unchanged
 *  component is a cheap no-op" guarantee above would stop being true the moment anything expensive
 *  gets chained off its completion. */
export async function upsertThreadFromComponent(
  members: UpsertThreadMemberInput[],
  span: { firstEventAt: Date; lastEventAt: Date },
  createIfMissing: { title: string; slug: string }
): Promise<{ thread: Thread; changed: boolean }> {
  return prisma.$transaction(async (tx) => {
    const storyIds = members.map((m) => m.storyId)
    const touched = await tx.threadMember.findMany({
      where: { storyId: { in: storyIds } },
      select: { thread: true },
      distinct: ['threadId'],
    })

    let thread: Thread
    if (touched.length === 0) {
      thread = await tx.thread.create({
        data: {
          title: createIfMissing.title,
          slug: createIfMissing.slug,
          firstEventAt: span.firstEventAt,
          lastEventAt: span.lastEventAt,
        },
      })
    } else {
      const touchedThreads = touched
        .map((t) => t.thread)
        .sort((a, b) => a.firstEventAt.getTime() - b.firstEventAt.getTime())
      thread = touchedThreads[0]!
      const mergedAwayIds = touchedThreads.slice(1).map((t) => t.id)
      if (mergedAwayIds.length > 0) {
        await tx.threadMember.deleteMany({ where: { threadId: { in: mergedAwayIds } } })
        await tx.thread.deleteMany({ where: { id: { in: mergedAwayIds } } })
      }
    }

    const current = await tx.threadMember.findMany({
      where: { threadId: thread.id },
      orderBy: { position: 'asc' },
      select: { storyId: true, position: true, role: true },
    })
    const unchanged =
      current.length === members.length &&
      current.every((cm, i) => cm.storyId === members[i]?.storyId && cm.role === members[i]?.role) &&
      thread.firstEventAt.getTime() === span.firstEventAt.getTime() &&
      thread.lastEventAt.getTime() === span.lastEventAt.getTime()
    if (unchanged) return { thread, changed: false }

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

    const updated = await tx.thread.update({
      where: { id: thread.id },
      data: {
        status,
        firstEventAt: span.firstEventAt,
        lastEventAt: span.lastEventAt,
        memberCount: members.length,
      },
    })
    return { thread: updated, changed: true }
  })
}

/** The bare `threadId` a Story belongs to, if any — a lighter lookup than `findThreadForStory`
 *  (which also loads every member) for callers that only need to know *whether* and *where* to
 *  chain a Thread-scoped job (ticket 72/75's `narrativeJob.ts` trigger — see `claimSeriesJob.ts`'s
 *  own doc comment for why). */
export async function findThreadIdForStory(storyId: string): Promise<string | null> {
  const member = await prisma.threadMember.findUnique({ where: { storyId }, select: { threadId: true } })
  return member?.threadId ?? null
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
  slug: string
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

  return { title: thread.title, slug: thread.slug, memberCount: thread.memberCount, members }
}

/** Sets a Thread's status directly — real code never does this (no `DORMANT → CLOSED` admin
 *  surface exists yet, ticket 17's Answer, Q4); exists for integration tests that need to
 *  exercise `upsertThreadFromComponent`'s "never auto-reopens a CLOSED Thread" behavior without
 *  that surface. Same convention as `setAnalysisCreatedAtForTesting` (repositories/analysis.ts). */
export async function setThreadStatusForTesting(threadId: string, status: Thread['status']): Promise<void> {
  await prisma.thread.update({ where: { id: threadId }, data: { status } })
}

export interface ThreadDimensionItemForOpenQuestions {
  id: string
  prose: string
}

export interface ThreadMemberForOpenQuestions {
  analysisId: string
  eventTime: Date
  contradiction: ThreadDimensionItemForOpenQuestions[]
  agreement: ThreadDimensionItemForOpenQuestions[]
  uniqueReporting: ThreadDimensionItemForOpenQuestions[]
}

/** Every currently-visible (COMPLETE) member of a Thread, with just the three dimension arrays
 *  ticket 67's open-questions synthesis reads (`contradiction`/`agreement`/`uniqueReporting`) —
 *  never `framing`, same exclusion `narrativePass.ts`'s own `NarrativeDimensions` makes and for
 *  the same reason (ADR 0012: framing differences aren't a "still open" question, they're a
 *  presentation difference). `null` for an unknown threadId. Ordered oldest-first by `eventTime`
 *  (falling back to `createdAt`, ticket 16 convention) — chronology matters to the prompt's own
 *  "was this addressed by a *later* member" framing. Only `id`/`prose` per dimension item, not the
 *  full `Attribution[]` — the LLM judges from prose, same minimalism `findAgreementForTitle`
 *  already applies to its own dimension read. */
export async function findVisibleMembersForOpenQuestions(
  threadId: string
): Promise<ThreadMemberForOpenQuestions[] | null> {
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    include: {
      members: {
        orderBy: { position: 'asc' },
        include: {
          story: {
            include: { analysis: { include: { synthesisResult: { select: { dimensions: true } } } } },
          },
        },
      },
    },
  })
  if (!thread) return null

  const members: ThreadMemberForOpenQuestions[] = []
  for (const m of thread.members) {
    const analysis = m.story.analysis
    if (!analysis || analysis.status !== 'COMPLETE' || !analysis.synthesisResult) continue
    const dimensions = analysis.synthesisResult.dimensions as {
      contradiction?: { id: string; prose: string }[]
      agreement?: { id: string; prose: string }[]
      uniqueReporting?: { id: string; prose: string }[]
    }
    // .map(...), not a bare cast — the stored dimensions JSON also carries `attributions` per
    // item, which must actually be dropped here (not just re-typed away), both to keep the LLM
    // prompt payload lean and because ThreadMemberForOpenQuestions's own contract promises
    // `{ id, prose }` only.
    const onlyIdAndProse = (items?: { id: string; prose: string }[]): ThreadDimensionItemForOpenQuestions[] =>
      (items ?? []).map(({ id, prose }) => ({ id, prose }))
    members.push({
      analysisId: analysis.id,
      eventTime: m.story.eventTime ?? m.story.createdAt,
      contradiction: onlyIdAndProse(dimensions.contradiction),
      agreement: onlyIdAndProse(dimensions.agreement),
      uniqueReporting: onlyIdAndProse(dimensions.uniqueReporting),
    })
  }
  return members
}

/** Persists ticket 67's open-questions synthesis result — see `threadOpenQuestionsPass.ts`.
 *  `[]`, not `Prisma.JsonNull`, for "the LLM ran and found nothing genuinely open" — both the
 *  never-yet-run and found-nothing states render identically on the Thread page (an empty rail),
 *  so the distinction isn't worth a nullable column. */
export async function updateThreadOpenQuestions(
  threadId: string,
  openQuestions: {
    question: string
    detail: string
    relatedItems: { analysisId: string; dimensionItemId: string }[]
  }[]
): Promise<void> {
  await prisma.thread.update({ where: { id: threadId }, data: { openQuestions } })
}

export interface VisibleThreadRankRow {
  slug: string
  title: string
  visibleMemberCount: number
  /** The latest `eventTime` (falling back to `createdAt`, ticket 16 convention) among only the
   *  currently-visible (COMPLETE) members — never the raw `Thread.lastEventAt`, which reflects
   *  the newest member regardless of status and can point at one a reader can never see. */
  lastVisibleEventAt: Date
}

export interface RawThreadForRanking {
  slug: string
  title: string
  members: { story: { eventTime: Date | null; createdAt: Date; analysis: { status: string } | null } }[]
}

/** The filter/sort half of `findVisibleThreadsRanked`, pulled out as a pure function so it's
 *  directly unit-testable (ticket 70's code review caught three separate bugs here — a fixed
 *  over-fetch multiplier that could silently drop a valid Thread, a missing tiebreak, and using
 *  the raw `Thread.lastEventAt` instead of only-visible-members' own span — all three easier to
 *  verify against fixtures than against a mocked Prisma call). Visibility (>= 2 currently-
 *  COMPLETE members) and "recently updated" both depend on each member's own Analysis status,
 *  several joins deep, so neither can be pushed into the SQL `where`/`orderBy` — this assumes the
 *  caller already fetched every Thread unbounded (small table in practice, see
 *  `findVisibleThreadsRanked`'s own docstring). Returns the full ranked list, unsliced — ticket 70
 *  (homepage rail) and ticket 71 (`/api/threads` browse-all listing) each take what they need from
 *  the front. */
export function rankVisibleThreads(threads: RawThreadForRanking[]): VisibleThreadRankRow[] {
  return (
    threads
      .map((t) => {
        const visibleEventTimes = t.members
          .filter((m) => m.story.analysis?.status === 'COMPLETE')
          .map((m) => m.story.eventTime ?? m.story.createdAt)
        return {
          slug: t.slug,
          title: t.title,
          visibleMemberCount: visibleEventTimes.length,
          lastVisibleEventAt: new Date(Math.max(...visibleEventTimes.map((d) => d.getTime()), 0)),
        }
      })
      .filter((t) => t.visibleMemberCount >= 2)
      // Deterministic secondary tiebreak on slug — same "two rows can share the same timestamp"
      // reasoning homepageStats.ts's own sibling queries already guard against (see
      // findHomepageMostReadRows's own comment there).
      .sort(
        (a, b) =>
          b.lastVisibleEventAt.getTime() - a.lastVisibleEventAt.getTime() || a.slug.localeCompare(b.slug)
      )
  )
}

/** Every Thread with at least 2 currently-visible (COMPLETE) members, ranked most-recently-
 *  updated first — shared by ticket 70's homepage rail and ticket 71's `/api/threads` browse-all
 *  listing. Fetches every Thread unbounded (no `take`): visibility can't be pushed into the SQL
 *  `where`, and a real deployment's Thread table is rare (only actual FOLLOW_UP chains materialize
 *  one) — same "small enough to scan outright" judgment `findEntityMentionsForStory` already makes
 *  for its own unbounded read. A fixed take-then-filter multiplier was tried and rejected here
 *  (ticket 70's code review) — it can silently drop a genuinely-visible Thread that just happens
 *  to sort past the cutoff. */
export async function findVisibleThreadsRanked(): Promise<VisibleThreadRankRow[]> {
  const threads = await prisma.thread.findMany({
    select: {
      slug: true,
      title: true,
      members: {
        select: {
          story: { select: { eventTime: true, createdAt: true, analysis: { select: { status: true } } } },
        },
      },
    },
  })

  return rankVisibleThreads(threads)
}
