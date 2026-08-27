import type { FastifyBaseLogger } from 'fastify'
import { runThreadTitlePass } from '../services/threadTitlePass.js'
import { runStageOrThrow } from '../services/pipelineStage.js'
import { resolveDisplayTitle } from '../mappers/analysis.js'
import { COMBINING_DIACRITICS } from '../services/entityKey.js'
import { enqueueJob } from './enqueue.js'
import type {
  ThreadComponentMember,
  StoryAgreementForTitle,
  UpsertThreadMemberInput,
  Thread,
  ThreadRole,
} from '../repositories/thread.js'
import { JobName, type JobPayload } from './jobDefinitions.js'

export interface ThreadRecomputeJobDeps {
  findFollowUpComponent: (seedStoryId: string) => Promise<ThreadComponentMember[]>
  anyExistingThreadForStories: (storyIds: string[]) => Promise<boolean>
  findAgreementForTitle: (storyIds: string[]) => Promise<StoryAgreementForTitle[]>
  upsertThreadFromComponent: (
    members: UpsertThreadMemberInput[],
    span: { firstEventAt: Date; lastEventAt: Date },
    createIfMissing: { title: string; slug: string }
  ) => Promise<{ thread: Thread; changed: boolean }>
}

/** First member is `ORIGIN`, last is `RESOLUTION` only once there are ≥3 members (a bare
 *  second-of-two-members Story hasn't earned "resolution" — a bookend that could just as easily
 *  gain a third member later), everything strictly between is `DEVELOPMENT`. `REACTION` is never
 *  produced — see ticket 17's Answer, Q2: detecting a "reactive" tone reliably would need either
 *  fragile keyword-matching over `StoryRelation.reasoning`'s free text or its own LLM
 *  classification call, disproportionate to a presentation-only positional label. Exported for
 *  direct unit testing, same convention as entityRelationJob.ts's deriveSourceTexts. */
export function inferRole(position: number, total: number): ThreadRole {
  if (position === 0) return 'ORIGIN'
  if (position === total - 1 && total >= 3) return 'RESOLUTION'
  return 'DEVELOPMENT'
}

/** URL-safe, not identity-preserving the way entityKey.ts's slugify is — Thread.slug has no
 *  reader route yet (ticket 17's Answer, Q3/Q5) to need a pretty one, so ASCII-folding diacritics
 *  away is fine here even though it would lose meaning for entityKey.ts's own purpose. Uniqueness
 *  comes from the appended origin storyId, not from this string alone, so an edge case producing
 *  an empty/short slug (e.g. a fully non-Latin title) still can't collide. */
function slugifyTitle(title: string, originStoryId: string): string {
  const base = title
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${base}-${originStoryId}`
}

/** The ORIGIN member's own resolved display title (`resolveDisplayTitle`, the same fallback rule
 *  every other title in the app uses) — falls back to the chronologically-first member if ORIGIN
 *  itself was skipped (its Analysis somehow missing, see `findAgreementForTitle`'s own note), and
 *  to a generic label only if there's no title data at all. Never blank, never fabricated. */
function fallbackTitle(membersByEventTime: StoryAgreementForTitle[], originStoryId: string): string {
  const origin = membersByEventTime.find((m) => m.storyId === originStoryId)
  const source = origin ?? membersByEventTime[0]
  return source ? resolveDisplayTitle(source.headline, source.seedHeadline) : 'Vícedílná kauza'
}

/** Generates a Thread's title via the LLM (see threadTitlePass.ts), never letting a failure there
 *  fail the whole job — an LLM hiccup on the presentation-only title isn't worth spending
 *  `thread.recompute`'s own retry budget on (`THREAD_RECOMPUTE_RETRY_POLICY`, ticket 13, sized
 *  for a cheap DB-only job, not a billed-LLM-call-times-10-retries one). Falls back to
 *  `fallbackTitle` on any generation failure — same "always some title, never blank or
 *  fabricated" guarantee `runHeadlinePass`'s own null-when-empty result gets at read time
 *  elsewhere, just resolved here instead since `Thread.title` is NOT NULL.
 *
 *  `membersByEventTime` must already be in chronological (eventTime) order — this is what makes
 *  the prose array sent to the LLM match `prompts/threadTitle.txt`'s own stated "each stage, in
 *  chronological order" contract; `findAgreementForTitle`'s own DB fetch does *not* preserve
 *  that order (Postgres doesn't for an `IN (...)` clause), so the caller re-sorts before this.
 *
 *  Only called for a component with no existing Thread — see `runThreadRecomputeJob`'s own
 *  `anyExistingThreadForStories` pre-check. A recompute of an already-existing Thread uses
 *  `fallbackTitle` directly instead, skipping the LLM call entirely: `Thread.title` is never
 *  regenerated once set (see `upsertThreadFromComponent`), so deriving a fresh one for a Thread
 *  that already has one would be pure waste — a real, billed call this ticket's own review round
 *  caught happening on every single recompute, not just the first. */
async function deriveThreadTitle(
  membersByEventTime: StoryAgreementForTitle[],
  originStoryId: string,
  log?: FastifyBaseLogger
): Promise<string> {
  try {
    return await runThreadTitlePass(
      membersByEventTime.map((m) => m.agreementProse),
      log
    )
  } catch (err) {
    log?.warn({ err, originStoryId }, 'thread.recompute job: title generation failed, using fallback title')
    return fallbackTitle(membersByEventTime, originStoryId)
  }
}

/** Handler for the `thread.recompute` job (ticket 17, ADR 0029): expands the full
 *  `PUBLISHED`/`FOLLOW_UP`-connected component containing `seedStoryId` (§8.6, docs/audit.md) and
 *  materializes it as a `Thread`/`ThreadMember` set — `StoryRelation` stays the source of truth,
 *  this is a rebuilt read model, never incrementally patched. A component of fewer than 2 members
 *  isn't a Thread yet (a lone Story with no confirmed edge) — logged and returned, not an error;
 *  a retry can't manufacture an edge that doesn't exist. Idempotency/concurrency: see
 *  `upsertThreadFromComponent`'s own doc comment — deliberately not lock-coordinated, relying on
 *  `ThreadMember.storyId`'s unique constraint plus pg-boss's retry to self-heal a rare race. */
export async function runThreadRecomputeJob(
  payload: JobPayload[typeof JobName.ThreadRecompute],
  deps: ThreadRecomputeJobDeps,
  log?: FastifyBaseLogger
): Promise<void> {
  const members = await runStageOrThrow(
    { seedStoryId: payload.seedStoryId },
    'Thread follow-up component fetch',
    log,
    () => deps.findFollowUpComponent(payload.seedStoryId)
  )

  if (members.length < 2) {
    log?.info(
      { seedStoryId: payload.seedStoryId, memberCount: members.length },
      'thread.recompute job: fewer than 2 members in the component, not a Thread yet'
    )
    return
  }

  const originStoryId = members[0].storyId
  const storyIds = members.map((m) => m.storyId)

  // Independent reads, run concurrently. findAgreementForTitle doesn't preserve the CTE's own
  // eventTime order (Postgres doesn't for an IN (...) clause) — re-sort against `members`, which
  // is already chronological, before this feeds either the LLM prompt (told to expect
  // chronological order) or the fallback's own "ORIGIN, else chronologically-first" logic.
  const [agreementResult, hasExistingThread] = await Promise.all([
    deps.findAgreementForTitle(storyIds),
    deps.anyExistingThreadForStories(storyIds),
  ])
  const agreementByStoryId = new Map(agreementResult.map((f) => [f.storyId, f]))
  const membersByEventTime = members
    .map((m) => agreementByStoryId.get(m.storyId))
    .filter((f): f is StoryAgreementForTitle => f !== undefined)

  // A Thread whose title already exists is never regenerated (see upsertThreadFromComponent) —
  // skip the billed LLM call entirely for a recompute of an already-known component, using the
  // same cheap, non-LLM fallback title the create path only reaches for on an LLM failure.
  const title = hasExistingThread
    ? fallbackTitle(membersByEventTime, originStoryId)
    : await deriveThreadTitle(membersByEventTime, originStoryId, log)

  const memberInputs: UpsertThreadMemberInput[] = members.map((m, i) => ({
    storyId: m.storyId,
    position: i,
    role: inferRole(i, members.length),
  }))

  const { thread, changed } = await runStageOrThrow(
    { seedStoryId: payload.seedStoryId },
    'Thread upsert',
    log,
    () =>
      deps.upsertThreadFromComponent(
        memberInputs,
        { firstEventAt: members[0].eventTime, lastEventAt: members[members.length - 1].eventTime },
        { title, slug: slugifyTitle(title, originStoryId) }
      )
  )

  // thread.synthesizeOpenQuestions (ticket 67/74): chained off this job's own successful upsert,
  // not enqueued from the same trigger points thread.recompute itself is — the open-questions
  // pass reads the Thread/ThreadMember rows the upsert just wrote, so enqueueing it any earlier
  // would race that write. Skipped entirely when `changed` is false: a duplicate thread.recompute
  // for an unchanged component must stay the cheap no-op `upsertThreadFromComponent`'s own
  // docstring promises, not chain a real, billed LLM call every time. Its own try/catch: a
  // failure to enqueue must not fail thread.recompute, which has already succeeded by this point.
  if (changed) {
    try {
      await enqueueJob(JobName.ThreadSynthesizeOpenQuestions, { threadId: thread.id })
    } catch (err) {
      log?.error(
        { seedStoryId: payload.seedStoryId, threadId: thread.id, err },
        'Failed to enqueue thread.synthesizeOpenQuestions after thread.recompute upsert'
      )
    }
    // thread.trackClaimSeries (ticket 72/75): same chaining reasoning as
    // thread.synthesizeOpenQuestions above, plus its own second trigger point
    // (narrativeJob.ts) — see claimSeriesJob.ts's doc comment for why one job needs both.
    try {
      await enqueueJob(JobName.ThreadTrackClaimSeries, { threadId: thread.id })
    } catch (err) {
      log?.error(
        { seedStoryId: payload.seedStoryId, threadId: thread.id, err },
        'Failed to enqueue thread.trackClaimSeries after thread.recompute upsert'
      )
    }
    // thread.notifySubscribers (ticket 82): same chaining reasoning as the two jobs above.
    // Harmless to enqueue on a brand-new Thread's own first creation too, not just a later
    // growth — nobody could have followed a Thread before it existed, so that run just finds
    // zero ThreadFollow rows and no-ops, same as every other consumer of this `if (changed)`
    // block already does for that case.
    try {
      await enqueueJob(JobName.ThreadNotifySubscribers, { threadId: thread.id })
    } catch (err) {
      log?.error(
        { seedStoryId: payload.seedStoryId, threadId: thread.id, err },
        'Failed to enqueue thread.notifySubscribers after thread.recompute upsert'
      )
    }
  }
}
