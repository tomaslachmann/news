# ADR 0028 — Adopt pg-boss for entity/relation, narrative, and thread work

## Status
Accepted

## Context
Ticket 06 (resolved, `.scratch/backend-audit/issues/06-async-job-queue.md`) deferred `docs/audit.md`'s full Postgres-native job queue proposal (§6, §9.5), fixing its two most urgent symptoms — P0-5 and P2-22 — with lightweight, queue-free mechanisms (a durable failure marker with TTL retry; a row-lease lock) instead.

Ticket 07 ([Thread aggregate](../../.scratch/backend-audit/issues/07-thread-aggregate.md)) reopens this. The audit's own `thread.recompute` (§9.8) is specified as a `pg-boss` job, and there is no sync-friendly equivalent the way ticket 06 found for P0-5/P2-22: recomputing a `FOLLOW_UP`-edge connected component is cheap per invocation, but doing it synchronously inside whatever request happens to publish a `FOLLOW_UP` relation has no natural place to live (unlike narrative generation, which had an obvious synchronous home in a read endpoint). Building Thread now, per the ticket 07 grilling session's decision, means the queue ticket 06 deferred is now a real prerequisite, not a nice-to-have.

## Decision
Adopt `pg-boss`, per the audit's own primary recommendation (§6: "`pg-boss` staví frontu nad `SKIP LOCKED`... umožňuje atomický enqueue přímo ve vaší transakci"). A worker process shares the existing codebase via a separate entrypoint (`docker-compose.yml` gains a `worker` service), matching the audit's target diagram exactly.

**Moves to the queue:**
- `entity.extract` + `relation.link` — today's `extractEntitiesAndLinkStoryRelations`, called synchronously from `approveDraft`/`confirmCoverages`. Enqueued right after the Draft/Coverage-confirmation write that currently triggers it.
- `narrative.generate` — enqueued in the same transaction that marks an Analysis `COMPLETE` (mirroring how the tool-authored headline is already eagerly generated there, ADR 0021), instead of lazily on first reader view. This **supersedes ADR 0026**'s TTL-marker fix for P0-5 with the audit's actual originally-intended fix: no unauthenticated GET ever triggers an LLM call again, rather than a bounded-retry version of one still triggered from a read endpoint. `getAnalysisDetail` becomes pure DB reads, matching the audit's target (§6: "`GET /api/analyses/:id` → čte jen DB"). `SynthesisResult.narrativeGenerationFailedAt` is retained — its role shifts from gating a lazy HTTP-triggered retry to informing the job's own retry/backoff.
- `thread.recompute` (ticket 07's own job) — enqueued right after a `StoryRelation` transitions to `type=FOLLOW_UP, status=PUBLISHED`.

**Explicitly not moved, deliberately out of this decision's scope:**
- `feed.poll` conditional-GET and `article.fetch`/`article.extract` politeness (robots.txt, per-host rate limits) — [ticket 10](../../.scratch/backend-audit/issues/10-polite-scraping.md)'s scope, still open; adding a queue doesn't automatically pull that decision in.
- `story.match` (embedding + scoring) — cheap, no LLM call on Ingestion's hot path (ADR 0018), no reason to queue it.
- `analysis.extract`/`analysis.synthesize` — the human-seeded, SSE-streamed live-progress flow (`runAnalysisStream`). Moving this to a queue would replace real-time streaming with a poll-for-status UX — a separate, much larger decision than "adopt a queue," not implied by it.
- `POST /api/ingestion/run` itself — already serialized by `IngestionRunLock` (ADR 0027), which is retained as-is. The ingestion pass is a single already-idempotent background trigger, not a per-item unit of work suited to queuing.

Enqueue calls pass the current Prisma transaction's client to `pg-boss`'s `send()` wherever the triggering write and the enqueue can share one transaction, preserving the audit's stated guarantee: "vytvoř Draft a naplánuj jeho zpracování" is one atomic step, never a Draft without its job or a job without its Draft.

## Consequences
- `ADR 0026` is amended: its TTL-marker mechanism no longer gates narrative generation at read time, since generation no longer happens at read time at all. The migration is recorded in the ticket that implements this move (split from this ticket — see ticket 07's Answer section), not retroactively rewritten into ADR 0026 itself.
- The wayfinder map's ticket-06 decision entry is updated to note this partial reversal — ticket 06's choice to defer the queue stands for everything *except* what this ADR now accepts, not overturned wholesale.
- Operational surface grows: a `worker` process must be deployed and monitored alongside the API process, where none existed before. This is the real cost ticket 06 was avoiding, now accepted specifically because Thread has no queue-free path the way P0-5/P2-22 did.
- Every job this ADR adds is additive to what already runs synchronously — nothing outside the four listed moves changes behavior. A future ticket revisiting `feed.poll`/`article.fetch`/the SSE flow is a new decision, not something this ADR pre-authorizes.
