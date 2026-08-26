import type { NarrativeDocument } from '@news-triangulator/shared'
import { prisma } from '../db.js'

export interface ClaimTrackingMember {
  analysisId: string
  eventTime: Date
  /** `null` when this Analysis's Narrative hasn't been generated yet — `narrative.generate` runs
   *  as its own background job, fully decoupled from whatever triggered `thread.recompute` (ADR
   *  0028), so there is no ordering guarantee between the two. `claimSeriesJob.ts` skips a member
   *  in this state rather than treating it as "nothing to track" — see its own doc comment for how
   *  the job gets re-triggered once the Narrative does show up. */
  narrative: NarrativeDocument | null
}

/** Every currently-visible (COMPLETE) member of a Thread, with its own Narrative document (or
 *  `null` — see `ClaimTrackingMember`) — the source `findTrackableValues`
 *  (claimSeriesMatching.ts) reads from. `null` for an unknown threadId. Ordered oldest-first by
 *  `eventTime` (falling back to `createdAt`, ticket 16 convention), same as every other
 *  Thread-member read in this codebase. */
export async function findVisibleMembersForClaimTracking(
  threadId: string
): Promise<ClaimTrackingMember[] | null> {
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    include: {
      members: {
        orderBy: { position: 'asc' },
        include: {
          story: { include: { analysis: { include: { synthesisResult: { select: { narrative: true } } } } } },
        },
      },
    },
  })
  if (!thread) return null

  const members: ClaimTrackingMember[] = []
  for (const m of thread.members) {
    const analysis = m.story.analysis
    if (!analysis || analysis.status !== 'COMPLETE' || !analysis.synthesisResult) continue
    members.push({
      analysisId: analysis.id,
      eventTime: m.story.eventTime ?? m.story.createdAt,
      narrative: analysis.synthesisResult.narrative
        ? (analysis.synthesisResult.narrative as unknown as NarrativeDocument)
        : null,
    })
  }
  return members
}

/** Which of this Thread's member Analyses have already been considered by `claimSeriesJob.ts` —
 *  `claimSeriesJob.ts`'s own incremental-only property is "only ever process a member missing from
 *  this set." A member that had zero trackable values is *not* distinguished from one never yet
 *  attempted — both are cheaply re-scanned (and re-found to have nothing) on every later run,
 *  rather than persisting a separate "processed but empty" marker; see the job's own doc comment
 *  for why that's an acceptable simplification at this Thread-size scale. */
export async function findProcessedAnalysisIdsForThread(threadId: string): Promise<Set<string>> {
  const rows = await prisma.claimSeriesMember.findMany({
    where: { series: { threadId } },
    select: { analysisId: true },
  })
  return new Set(rows.map((r) => r.analysisId))
}

export interface LatestSeriesMemberRow {
  seriesId: string
  entityKeys: string[]
  unit: string | null
  normalizedValue: number
  text: string
}

/** One row per existing `ClaimSeries` of this Thread: its own most-recently-added member (by
 *  `eventTime`), all read from denormalized `ClaimSeriesMember` columns — never a re-parse of any
 *  member's Narrative document (see `ClaimSeriesMember`'s own schema comment). What
 *  `claimSeriesMatching.ts`'s `findCandidateSeries` narrows against. A Thread's `ClaimSeries` count
 *  is small (bounded by how many distinct trackable claims it ever produces, in practice far fewer
 *  than its member count), so picking the max-`eventTime` row per series in application code —
 *  rather than a `DISTINCT ON` query — is simple and cheap enough at this scale. */
export async function findLatestSeriesMembersForThread(threadId: string): Promise<LatestSeriesMemberRow[]> {
  const rows = await prisma.claimSeriesMember.findMany({
    where: { series: { threadId } },
    select: {
      seriesId: true,
      entityKeys: true,
      unit: true,
      normalizedValue: true,
      text: true,
      eventTime: true,
    },
  })

  const latestBySeriesId = new Map<string, (typeof rows)[number]>()
  for (const row of rows) {
    const current = latestBySeriesId.get(row.seriesId)
    if (!current || row.eventTime.getTime() > current.eventTime.getTime()) {
      latestBySeriesId.set(row.seriesId, row)
    }
  }

  return [...latestBySeriesId.values()].map((r) => ({
    seriesId: r.seriesId,
    entityKeys: r.entityKeys,
    unit: r.unit,
    normalizedValue: r.normalizedValue,
    text: r.text,
  }))
}

export interface ClaimSeriesPointRow {
  eventTime: Date
  normalizedValue: number
  unit: string | null
  sourceIds: string[]
}

export interface ClaimSeriesItemRow {
  id: string
  points: ClaimSeriesPointRow[]
}

/** Every `ClaimSeries` a Thread has accumulated, each with every member point ordered oldest-first
 *  by `eventTime` — ticket 75's API surface, exposed via `ThreadDetail.claimSeries`, ready for
 *  ticket 76's `kind: 'line'` chart to plot directly. Unfiltered: a series with only one point is
 *  still included — deciding what's "worth showing as a trend" is the frontend's call (ticket 76),
 *  not this read path's. */
export async function findClaimSeriesForThread(threadId: string): Promise<ClaimSeriesItemRow[]> {
  const series = await prisma.claimSeries.findMany({
    where: { threadId },
    select: {
      id: true,
      members: {
        orderBy: { eventTime: 'asc' },
        select: { eventTime: true, normalizedValue: true, unit: true, sourceIds: true },
      },
    },
  })
  return series.map((s) => ({ id: s.id, points: s.members }))
}

export interface NewClaimSeriesMemberInput {
  analysisId: string
  eventTime: Date
  valueRefId: string
  text: string
  normalizedValue: number
  unit: string | null
  sourceIds: string[]
  entityKeys: string[]
}

/** Writes one new trackable value as a `ClaimSeriesMember` — joining `seriesId` if given (the LLM
 *  judged it a continuation, `claimSeriesLinkingPass.ts`), or creating a brand-new `ClaimSeries`
 *  for this Thread otherwise. One transaction so a series is never left without its first member
 *  (or vice versa) if the process dies mid-write. */
export async function addClaimSeriesMember(
  threadId: string,
  seriesId: string | null,
  input: NewClaimSeriesMemberInput
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const targetSeriesId = seriesId ?? (await tx.claimSeries.create({ data: { threadId } })).id
    await tx.claimSeriesMember.create({
      data: {
        seriesId: targetSeriesId,
        analysisId: input.analysisId,
        eventTime: input.eventTime,
        valueRefId: input.valueRefId,
        text: input.text,
        normalizedValue: input.normalizedValue,
        unit: input.unit,
        sourceIds: input.sourceIds,
        entityKeys: input.entityKeys,
      },
    })
  })
}
