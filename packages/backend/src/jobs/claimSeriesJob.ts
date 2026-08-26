import type { FastifyBaseLogger } from 'fastify'
import { findTrackableValues, findCandidateSeries } from '../services/claimSeriesMatching.js'
import { runClaimSeriesLinkingPass, type ValueWithCandidates } from '../services/claimSeriesLinkingPass.js'
import { runStageOrThrow } from '../services/pipelineStage.js'
import type {
  ClaimTrackingMember,
  LatestSeriesMemberRow,
  NewClaimSeriesMemberInput,
} from '../repositories/claimSeries.js'
import { JobName, type JobPayload } from './jobDefinitions.js'

export interface ClaimSeriesJobDeps {
  findVisibleMembersForClaimTracking: (threadId: string) => Promise<ClaimTrackingMember[] | null>
  findProcessedAnalysisIdsForThread: (threadId: string) => Promise<Set<string>>
  findLatestSeriesMembersForThread: (threadId: string) => Promise<LatestSeriesMemberRow[]>
  addClaimSeriesMember: (
    threadId: string,
    seriesId: string | null,
    input: NewClaimSeriesMemberInput
  ) => Promise<void>
}

/** Handler for the `thread.trackClaimSeries` job (ticket 72/75). Incremental only — a run only
 *  ever considers members `findProcessedAnalysisIdsForThread` doesn't already know about, and
 *  never revisits or re-links an already-written `ClaimSeriesMember` (ticket 72's Answer).
 *
 *  A member whose Narrative hasn't been generated yet (`narrative: null` —
 *  `ClaimTrackingMember`'s own doc comment explains why this can happen) is left unprocessed
 *  rather than treated as "nothing to track": this job is enqueued from two independent trigger
 *  points precisely to self-heal that race — `thread.recompute`'s own successful upsert (which
 *  might run before the newest member's Narrative exists) and `narrative.generate`'s own
 *  successful completion for a Story that's already a Thread member (which catches the case where
 *  the Narrative finishes after `thread.recompute` already ran). Whichever trigger fires last for
 *  a given member is the one that actually finds it ready.
 *
 *  Re-fetches `findLatestSeriesMembersForThread` before each member (not once for the whole
 *  batch): if two unprocessed members are caught up in the same run, the later one must candidate-
 *  match against the earlier one's just-written point, not a stale pre-run snapshot. */
export async function runClaimSeriesJob(
  payload: JobPayload[typeof JobName.ThreadTrackClaimSeries],
  deps: ClaimSeriesJobDeps,
  log?: FastifyBaseLogger
): Promise<void> {
  const members = await deps.findVisibleMembersForClaimTracking(payload.threadId)
  if (!members) {
    log?.warn(
      { threadId: payload.threadId },
      'thread.trackClaimSeries job: Thread no longer exists, skipping'
    )
    return
  }

  const processed = await deps.findProcessedAnalysisIdsForThread(payload.threadId)
  const unprocessed = members.filter((m) => !processed.has(m.analysisId))
  const ready = unprocessed.filter(
    (m): m is ClaimTrackingMember & { narrative: NonNullable<ClaimTrackingMember['narrative']> } =>
      m.narrative !== null
  )

  if (ready.length === 0) {
    log?.info(
      { threadId: payload.threadId, unprocessedCount: unprocessed.length },
      'thread.trackClaimSeries job: nothing ready to process (either fully caught up, or the newest member(s) have no Narrative yet)'
    )
    return
  }

  for (const member of ready) {
    const trackableValues = findTrackableValues(member.narrative)
    if (trackableValues.length === 0) continue

    const latestSeriesMembers = await deps.findLatestSeriesMembersForThread(payload.threadId)
    const itemsWithCandidates: ValueWithCandidates[] = trackableValues.map((value) => ({
      value,
      candidates: findCandidateSeries(value, latestSeriesMembers),
    }))
    const needsLlm = itemsWithCandidates.filter((item) => item.candidates.length > 0)
    const links =
      needsLlm.length > 0
        ? await runStageOrThrow(
            { threadId: payload.threadId, analysisId: member.analysisId },
            'Claim series linking',
            log,
            () => runClaimSeriesLinkingPass(needsLlm, log)
          )
        : []
    const seriesIdByValueRefId = new Map(links.map((l) => [l.valueRefId, l.seriesId]))

    for (const { value } of itemsWithCandidates) {
      const seriesId = seriesIdByValueRefId.get(value.valueRefId) ?? null
      await deps.addClaimSeriesMember(payload.threadId, seriesId, {
        analysisId: member.analysisId,
        eventTime: member.eventTime,
        valueRefId: value.valueRefId,
        text: value.text,
        normalizedValue: value.normalizedValue,
        unit: value.unit,
        sourceIds: value.sourceIds,
        entityKeys: value.entityKeys,
      })
    }
  }
}
