# 06 — Async job queue: now or trigger-deferred?

Type: grilling
Status: resolved
Blocked by: none — can start immediately

## Question

Today, everything runs synchronously inside an HTTP request: ingestion polling, entity extraction, relation confirmation, and narrative generation all happen in a request handler (audit §6 has the current-state diagram). Two specific findings:

- **P0-5** — an *unauthenticated* public `GET /api/analyses/:id` triggers `runNarrativePass()` (a paid LLM call) directly in the request handler, with only in-memory (non-durable, non-cross-instance) dedup against duplicate calls. This is a cost/DoS exposure independent of scale — someone hammering the endpoint spends real money.
- **Etapa 5** (§7, §9.5) — the audit's broader proposal: a Postgres-native job queue (`pg-boss` or Graphile Worker, using `SKIP LOCKED`) with a worker entrypoint sharing the same codebase, enqueued transactionally alongside the domain write so "create a Draft" and "schedule its processing" can never desync. The audit gives explicit escalation criteria for *when this is worth it*: ≥2 of (>~50 sources, need to replay event history for re-scoring, more than one independent consumer of the same event).

Decide:

1. Does P0-5 need an independent, cheap fix now (e.g. move narrative generation behind an admin-gated trigger, or a feature flag, as the audit's own Etapa 1 suggests as a stopgap) regardless of whether the full queue is built? This is the one piece of this cluster that reads as urgent on its own.
2. For the full job-queue rework: do the audit's own escalation criteria (§6, quoted above) match this project's future-growth trajectory, or does a different trigger make more sense here specifically?
3. If deferred: does anything about *today's* code need to change to make the eventual migration cheaper later (e.g. keeping LLM-calling functions structured so they can be lifted into a worker without a rewrite), or is that premature?
4. Folds in **P2-22** (no idempotency/lock on an ingestion run — two overlapping cron triggers could double-process) — decide whether that's cheap enough to fix independent of the queue decision.

## Answer

**Deferred**: the full Postgres-native job queue (pg-boss/Graphile Worker, §6/§9.5). Trigger adopted from the audit as-is: ≥2 of (>~50 sources, need to replay event history for re-scoring, more than one independent consumer of the same event) — concrete, cheap to check, no reason found to deviate from what the audit already proposed. No speculative "prep for the eventual queue" restructuring — today's service functions (pass-data-in/get-result-out async functions, per ADR 0010's layering) already look worker-friendly by construction.

**Accepted now, independent of the deferred queue:**

- **P0-5** — real, and worse on inspection than "concurrent requests only": a *failed* narrative generation (LLM error, or quote verification dropping every segment) left `narrative` null forever, so every subsequent unauthenticated view of that Analysis retried the full LLM call — unbounded cost, no budget, no backoff, regardless of concurrency. Fixed via a durable `narrativeGenerationFailedAt` marker + 24h TTL-bounded auto-retry, recorded as [ADR 0026](../../../docs/adr/0026-narrative-generation-failure-marker.md). No new authenticated "regenerate" endpoint — TTL-only, so a transient failure self-heals without requiring an Admin to act, and the public-read policy itself (CONTEXT.md's Auth Boundary) is untouched, since that's a separate, deliberate decision this ticket doesn't revisit.
- **P2-22** — fixed via `IngestionRunLock`, a single-row lease (claim/release as one atomic conditional `UPDATE` each) around `runIngestionPass`, recorded as [ADR 0027](../../../docs/adr/0027-ingestion-run-lock-row-lease-not-advisory-lock.md). Not the `pg_advisory_xact_lock` pattern from `repositories/entity.ts` (ticket 04) first considered mid-session — that pattern wraps one short, DB-only transaction, and `runIngestionPass` is a long-running function making external network calls (RSS fetches, embedding API calls) that must not be held inside one long-lived transaction or session-pinned advisory lock. Fact-checked before deciding the fix was still worth it: the ingestion scheduler (`docker-compose.yml`) is a shell loop (`curl --max-time 600; sleep 1200`), not a fixed-interval cron — `sleep` only starts after `curl` returns, so back-to-back *scheduled* triggers structurally cannot overlap. The real exposure is a manual/admin-triggered run racing an in-flight scheduled one; the lock is cheap enough to add regardless, and also protects against a future different scheduler that could overlap more readily.

Implemented on `ticket/audit-06-async-job-queue`.
