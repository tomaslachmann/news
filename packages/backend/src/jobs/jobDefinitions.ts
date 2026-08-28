import type { QueueOptions } from 'pg-boss'

// Established once here so tickets 14/15/17 register against these names/payloads instead of
// each inventing their own — see .scratch/backend-audit/issues/13-pg-boss-job-queue-infrastructure.md.
export const JobName = {
  EntityRelation: 'entity.extract',
  Narrative: 'narrative.generate',
  ThreadRecompute: 'thread.recompute',
  ThreadSynthesizeOpenQuestions: 'thread.synthesizeOpenQuestions',
  ThreadTrackClaimSeries: 'thread.trackClaimSeries',
  ThreadNotifySubscribers: 'thread.notifySubscribers',
  EntityImageEnrich: 'entity.image.enrich',
  HomepageEntityStatsRefresh: 'homepage.entity-stats.refresh',
  EntityWikidataScan: 'entity.wikidata.scan',
} as const

export type JobNameValue = (typeof JobName)[keyof typeof JobName]

export interface JobPayload {
  // `origin` lets the job handler reproduce each trigger point's exact source-text selection
  // (see .scratch/backend-audit/issues/14-entity-relation-job.md) without guessing it from
  // Coverage DB state alone — approveDraft includes the Story's anchor headline, confirmCoverages
  // and approvePendingAddition (ticket 45) don't. `coverageIds` pins exactly which Coverage rows
  // were eligible (anchor-verified for draft-approval, scraped OK for coverage-confirmation/
  // pending-addition-approval) at enqueue time — the job handler still re-reads each row's current
  // extractedText/title/status by id for retry-safety, but never considers a Coverage attached to
  // this Analysis *after* enqueue, which would otherwise leak never-verified content into
  // extraction (a concurrent Ingestion poll can attach new Coverage to a PENDING/DRAFT Analysis at
  // any time, independent of this job).
  [JobName.EntityRelation]: {
    analysisId: string
    origin: 'draft-approval' | 'coverage-confirmation' | 'pending-addition-approval'
    coverageIds: string[]
  }
  [JobName.Narrative]: { analysisId: string }
  // `seedStoryId`, not a Thread id (ticket 13's original placeholder) — a Thread may not exist
  // yet when the triggering FOLLOW_UP edge is confirmed; the job derives the whole connected
  // component from this one Story and finds-or-creates the Thread itself (see ticket 17's
  // Answer, docs/audit.md §8.6/§9.8).
  [JobName.ThreadRecompute]: { seedStoryId: string }
  // Ticket 67/74 — a real Thread id (not a seedStoryId): unlike thread.recompute, this only ever
  // runs once a Thread already exists (enqueued right after thread.recompute's own upsert
  // succeeds — see threadRecomputeJob.ts), so there's no find-or-create ambiguity to resolve.
  [JobName.ThreadSynthesizeOpenQuestions]: { threadId: string }
  // Ticket 72/75 — same "a real Thread id, only ever runs once a Thread exists" shape as
  // ThreadSynthesizeOpenQuestions above (see threadRecomputeJob.ts). Also enqueued from
  // narrativeJob.ts on its own completion, for a Story that's already a Thread member — see
  // claimSeriesJob.ts's own doc comment for why two trigger points are needed here.
  [JobName.ThreadTrackClaimSeries]: { threadId: string }
  // Ticket 82 — same "a real Thread id, only ever runs once a Thread exists" shape as its
  // ThreadSynthesizeOpenQuestions/ThreadTrackClaimSeries siblings above, chained from the same
  // threadRecomputeJob.ts `if (changed)` block.
  [JobName.ThreadNotifySubscribers]: { threadId: string }
  // Ticket 41 / ADR 0034 — enqueued only after the Admin's wikidataId-link transaction commits,
  // never from inside it, so a slow/failing Wikimedia call can't hold up or roll back the link.
  // The handler re-reads the Entity's current wikidataId by this id (retry-safe, same
  // re-read-by-id pattern entity.extract already uses for coverageIds) rather than trusting a
  // wikidataId carried in the payload, which could be stale by the time the job runs.
  [JobName.EntityImageEnrich]: { entityId: string }
  [JobName.HomepageEntityStatsRefresh]: Record<string, never>
  // Ticket 93 / ADR 0042 — the scheduled semi-automated Wikidata linker. No payload: it re-derives
  // its whole work-list (unlinked entities above a story-count threshold, capped per run) from the
  // DB on each run, exactly like homepage.entity-stats.refresh.
  [JobName.EntityWikidataScan]: Record<string, never>
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

// An external HTTP dependency (Wikidata/Wikimedia), not an LLM call — LLM_JOB_RETRY_POLICY's
// "persistent outage vs. content issue" framing doesn't apply the same way here (ADR 0034), but a
// short bounded backoff is still the right shape for a flaky third-party API.
const EXTERNAL_HTTP_JOB_RETRY_POLICY: QueueOptions = {
  retryLimit: 3,
  retryBackoff: true,
  retryDelay: 2,
  retryDelayMax: 30,
}

const DB_DERIVED_READ_MODEL_RETRY_POLICY: QueueOptions = {
  retryLimit: 5,
  retryDelay: 30,
}

export const JOB_RETRY_POLICY: Record<JobNameValue, QueueOptions> = {
  [JobName.EntityRelation]: LLM_JOB_RETRY_POLICY,
  [JobName.Narrative]: LLM_JOB_RETRY_POLICY,
  [JobName.ThreadRecompute]: THREAD_RECOMPUTE_RETRY_POLICY,
  // A real LLM call (ticket 67's Answer: separate from thread.recompute specifically so this can
  // have its own LLM-flakiness-tuned policy, not thread.recompute's tight DB-only one).
  [JobName.ThreadSynthesizeOpenQuestions]: LLM_JOB_RETRY_POLICY,
  [JobName.ThreadTrackClaimSeries]: LLM_JOB_RETRY_POLICY,
  // An external HTTP dependency (the push service each subscription's endpoint belongs to), not
  // an LLM call -- same reasoning EntityImageEnrich already uses this policy for (ADR 0034).
  [JobName.ThreadNotifySubscribers]: EXTERNAL_HTTP_JOB_RETRY_POLICY,
  [JobName.EntityImageEnrich]: EXTERNAL_HTTP_JOB_RETRY_POLICY,
  [JobName.HomepageEntityStatsRefresh]: DB_DERIVED_READ_MODEL_RETRY_POLICY,
  // External HTTP dependency (Wikidata + the reconciliation service), same as EntityImageEnrich.
  // The scan is idempotent — a retry just re-derives the work-list and recomputes.
  [JobName.EntityWikidataScan]: EXTERNAL_HTTP_JOB_RETRY_POLICY,
}
