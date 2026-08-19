import type { QueueOptions } from 'pg-boss'

// Established once here so tickets 14/15/17 register against these names/payloads instead of
// each inventing their own — see .scratch/backend-audit/issues/13-pg-boss-job-queue-infrastructure.md.
export const JobName = {
  EntityRelation: 'entity.extract',
  Narrative: 'narrative.generate',
  ThreadRecompute: 'thread.recompute',
} as const

export type JobNameValue = (typeof JobName)[keyof typeof JobName]

export interface JobPayload {
  // `origin` lets the job handler reproduce each trigger point's exact source-text selection
  // (see .scratch/backend-audit/issues/14-entity-relation-job.md) without guessing it from
  // Coverage DB state alone — approveDraft includes the Story's anchor headline, confirmCoverages
  // doesn't.
  [JobName.EntityRelation]: { analysisId: string; origin: 'draft-approval' | 'coverage-confirmation' }
  [JobName.Narrative]: { analysisId: string }
  [JobName.ThreadRecompute]: { threadId: string }
}

// A repeated LLM failure is either a persistent outage (more retries won't help) or a genuine
// content issue (the same failure every time), so a short, bounded backoff — not indefinite
// retries that just spend money.
const LLM_JOB_RETRY_POLICY: QueueOptions = {
  retryLimit: 3,
  retryBackoff: true,
  retryDelay: 1,
  retryDelayMax: 60,
}

// Cheap, deterministic, DB-only — retries are nearly free, so a higher limit with a short fixed
// delay instead of backoff.
const THREAD_RECOMPUTE_RETRY_POLICY: QueueOptions = {
  retryLimit: 10,
  retryDelay: 5,
}

export const JOB_RETRY_POLICY: Record<JobNameValue, QueueOptions> = {
  [JobName.EntityRelation]: LLM_JOB_RETRY_POLICY,
  [JobName.Narrative]: LLM_JOB_RETRY_POLICY,
  [JobName.ThreadRecompute]: THREAD_RECOMPUTE_RETRY_POLICY,
}
