import type { FastifyBaseLogger } from 'fastify'
import { runThreadTitlePass } from '../services/threadTitlePass.js'
import { runStageOrThrow } from '../services/pipelineStage.js'
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
  findAgreementForTitle: (storyIds: string[]) => Promise<StoryAgreementForTitle[]>
  upsertThreadFromComponent: (
    members: UpsertThreadMemberInput[],
    span: { firstEventAt: Date; lastEventAt: Date },
    createIfMissing: { title: string; slug: string }
  ) => Promise<Thread>
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

const DIACRITICS = /[̀-ͯ]/g

/** URL-safe, not identity-preserving the way entityKey.ts's slugify is — Thread.slug has no
 *  reader route yet (ticket 17's Answer, Q3/Q5) to need a pretty one, so ASCII-folding diacritics
 *  away is fine here even though it would lose meaning for entityKey.ts's own purpose. Uniqueness
 *  comes from the appended origin storyId, not from this string alone, so an edge case producing
 *  an empty/short slug (e.g. a fully non-Latin title) still can't collide. */
function slugifyTitle(title: string, originStoryId: string): string {
  const base = title
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${base}-${originStoryId}`
}

/** Generates a Thread's title via the LLM (see threadTitlePass.ts), never letting a failure there
 *  fail the whole job — an LLM hiccup on the presentation-only title isn't worth spending
 *  `thread.recompute`'s own retry budget on (`THREAD_RECOMPUTE_RETRY_POLICY`, ticket 13, sized
 *  for a cheap DB-only job, not a billed-LLM-call-times-10-retries one). Falls back to the
 *  ORIGIN member's own resolved display title — same "always some title, never blank or
 *  fabricated" guarantee runHeadlinePass's own null-when-empty result gets via
 *  resolveDisplayTitle elsewhere, just resolved here instead of at read time since Thread.title
 *  is NOT NULL. */
async function deriveThreadTitle(
  members: StoryAgreementForTitle[],
  originStoryId: string,
  log?: FastifyBaseLogger
): Promise<string> {
  const origin = members.find((m) => m.storyId === originStoryId)
  const fallback = origin?.displayTitle ?? members[0]?.displayTitle ?? 'Vícedílná kauza'

  try {
    return await runThreadTitlePass(
      members.map((m) => m.agreementProse),
      log
    )
  } catch (err) {
    log?.warn({ err, originStoryId }, 'thread.recompute job: title generation failed, using fallback title')
    return fallback
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
  // Only ever needed if this component turns out to have no existing Thread yet — computed
  // unconditionally regardless, since knowing that requires the same DB round-trip
  // upsertThreadFromComponent's own transaction repeats anyway (see that function's doc comment
  // on the narrow race this duplicated check exists to self-heal, not to optimize away).
  const forTitle = await deps.findAgreementForTitle(members.map((m) => m.storyId))
  const title = await deriveThreadTitle(forTitle, originStoryId, log)

  const memberInputs: UpsertThreadMemberInput[] = members.map((m, i) => ({
    storyId: m.storyId,
    position: i,
    role: inferRole(i, members.length),
  }))

  await runStageOrThrow({ seedStoryId: payload.seedStoryId }, 'Thread upsert', log, () =>
    deps.upsertThreadFromComponent(
      memberInputs,
      { firstEventAt: members[0].eventTime, lastEventAt: members[members.length - 1].eventTime },
      { title, slug: slugifyTitle(title, originStoryId) }
    )
  )
}
