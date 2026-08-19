# 13 — pg-boss job queue infrastructure

Type: grilling
Status: resolved
Blocked by: none — can start immediately

## Question

Split from [Thread aggregate](07-thread-aggregate.md), whose `thread.recompute` job has no synchronous fallback the way ticket 06's P0-5/P2-22 fixes did — building Thread reopens part of ticket 06's queue deferral. Recorded as [ADR 0028](../../../docs/adr/0028-pg-boss-job-queue-adoption.md), which settles most of this ticket's scope already:

- **Library**: `pg-boss`, per the audit's own primary recommendation (§6, §9.5) — atomic enqueue inside the same Prisma transaction as the domain write it schedules, via `SKIP LOCKED`, no external broker.
- **Deployment shape**: a worker process sharing the existing codebase, different entrypoint — `docker-compose.yml` gains a `worker` service, matching the audit's target diagram exactly.
- **What moves onto it** (each its own ticket, blocked by this one): `entity.extract`/`relation.link` (14), `narrative.generate` (15, supersedes ADR 0026's TTL-marker fix), `thread.recompute` (17, also blocked by 16).
- **What stays synchronous, explicitly out of scope**: `feed.poll`/`article.fetch` politeness (ticket 10), `story.match`, the human-seeded SSE-streamed analysis flow, and `POST /api/ingestion/run` itself (already serialized by `IngestionRunLock`, ADR 0027).

What this ticket itself needs to decide, not yet settled:

1. Job payload/typing conventions — how do job handlers get typed input given `pg-boss`'s job data is untyped JSON at the boundary? Establish the pattern once here so tickets 14/15/17 don't each invent their own.
2. Retry/backoff policy defaults — `pg-boss` supports configurable retry count/delay per job. What's a sensible default for an LLM-calling job (entity extraction, narrative generation) versus a cheap DB-only one (thread.recompute)?
3. Observability — does a job failure need its own log table (mirroring `LlmCallLog`/`MatchDecision`'s "inspect via Prisma Studio" convention), or is `pg-boss`'s own job-state table (it keeps completed/failed jobs for a retention window) sufficient for now?
4. Local dev workflow — does `mise.toml` need a new task to run the worker process locally (alongside the existing `dev`/backend tasks), and does the worker need its own `Dockerfile`/entrypoint script or can it reuse the backend's with a different start command?
5. Does moving `entity.extract`/`relation.link`/`narrative.generate` off their current synchronous call sites change any existing tests' assumptions (they currently assert these run inline and complete before the request returns)? Not this ticket's job to fix those tests, but worth flagging so ticket 14/15 scope includes it.

## Answer

All five settled by direct application of this project's existing conventions — none needed a real fork/decision:

1. **Job naming/typing**: a `JobName` const object (e.g. `export const JobName = { EntityRelation: 'entity.extract', Narrative: 'narrative.generate', ThreadRecompute: 'thread.recompute' } as const`), not bare string literals at call sites — a rename is a one-place change, a typo is a compile error. Paired with a `JobPayload` interface mapping each `JobName` value to its payload shape, and thin `enqueue<K>`/`registerWorker<K>` wrappers around `pg-boss`'s own `send`/`work` giving compile-time safety at both enqueue and handler sites.
2. **Retry/backoff**: LLM-calling jobs (`entity.extract`, `narrative.generate`) get `retryLimit: 3` with exponential backoff — a repeated failure is either a persistent outage (more retries won't help) or a genuine content issue (the same failure every time), so indefinite retries just spend money. `thread.recompute` (cheap, deterministic, DB-only) gets a higher `retryLimit` (10) with a short fixed delay — retries are nearly free. Starting points, not tuned results, same convention as every other threshold constant in this codebase (`MATCH_THRESHOLD`, `DEDUP_WINDOW_HOURS`, ...).
3. **Observability**: no new custom log table. `pg-boss` already tracks per-job state, retry count, and failure reason in its own job/archive tables — building a redundant one would duplicate what already exists. `LlmCallLog` keeps logging every LLM call regardless of whether it's invoked from a sync function or a job handler; that doesn't change.
4. **Dev/deploy workflow**: `docker-compose.yml`'s new `worker` service reuses `packages/backend/Dockerfile` as-is, overriding `CMD` to run the worker entrypoint instead of the API — matches the audit's "same code, different entrypoint" target exactly, no second Dockerfile. Locally, a new opt-in `mise` task (`worker`, `tsx watch` on the worker entrypoint) — separate from the default `dev` task, same pattern as the existing `ingestion-cron` task.
5. Confirmed real, carried forward as explicit scope for tickets 14/15 rather than fixed here.

Implemented on `ticket/audit-13-pg-boss-job-queue-infrastructure`.
