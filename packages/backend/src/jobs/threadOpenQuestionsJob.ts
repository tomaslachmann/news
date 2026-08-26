import type { FastifyBaseLogger } from 'fastify'
import { runStageOrThrow } from '../services/pipelineStage.js'
import { runThreadOpenQuestionsPass, type ThreadOpenQuestion } from '../services/threadOpenQuestionsPass.js'
import type { ThreadMemberForOpenQuestions } from '../repositories/thread.js'
import { JobName, type JobPayload } from './jobDefinitions.js'

export interface ThreadOpenQuestionsJobDeps {
  findVisibleMembersForOpenQuestions: (threadId: string) => Promise<ThreadMemberForOpenQuestions[] | null>
  updateThreadOpenQuestions: (threadId: string, openQuestions: ThreadOpenQuestion[]) => Promise<void>
}

/** Handler for the `thread.synthesizeOpenQuestions` job (ticket 67/74) — re-synthesizes a
 *  Thread's open-questions rail from scratch on every member addition (never incrementally
 *  patched, same "rebuilt read model" posture `thread.recompute` itself takes). Fewer than 2
 *  currently-visible members means the Thread page 404s regardless (same gate
 *  `threadDetailService.ts`'s `MIN_VISIBLE_MEMBERS` applies), so there's nothing worth spending an
 *  LLM call on — logged and returned, not an error, same as `thread.recompute`'s own
 *  fewer-than-2-members short-circuit. An unknown `threadId` (the Thread was merged away into
 *  another by a later `thread.recompute` — see `upsertThreadFromComponent`'s merge behavior —
 *  between enqueue and this job running) is likewise logged and returned, not retried: the
 *  surviving Thread's own recompute already enqueued its own synthesis.
 *
 *  Only the LLM-calling stage is wrapped in `runStageOrThrow`, matching `narrativeJob.ts`'s own
 *  split — a persist failure after a successful (or gracefully-empty) synthesis is still worth
 *  pg-boss retrying via `LLM_JOB_RETRY_POLICY`, same as everywhere else in this codebase. */
export async function runThreadOpenQuestionsJob(
  payload: JobPayload[typeof JobName.ThreadSynthesizeOpenQuestions],
  deps: ThreadOpenQuestionsJobDeps,
  log?: FastifyBaseLogger
): Promise<void> {
  const members = await deps.findVisibleMembersForOpenQuestions(payload.threadId)
  if (!members) {
    log?.warn(
      { threadId: payload.threadId },
      'thread.synthesizeOpenQuestions job: Thread no longer exists, skipping'
    )
    return
  }
  if (members.length < 2) {
    log?.info(
      { threadId: payload.threadId, memberCount: members.length },
      'thread.synthesizeOpenQuestions job: fewer than 2 visible members, skipping'
    )
    return
  }

  const logContext = { threadId: payload.threadId }
  const openQuestions = await runStageOrThrow(logContext, 'Thread open-questions synthesis', log, () =>
    runThreadOpenQuestionsPass(members, log)
  )

  await deps.updateThreadOpenQuestions(payload.threadId, openQuestions)
}
