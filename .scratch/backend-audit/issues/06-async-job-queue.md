# 06 — Async job queue: now or trigger-deferred?

Type: grilling
Status: open
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
