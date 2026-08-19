# ADR 0027 — Ingestion run lock: a row-lease, not a held Postgres advisory lock

## Status
Accepted

## Context
`docs/audit.md` P2-22 (folded into the wayfinder map's [Async job queue](../../.scratch/backend-audit/issues/06-async-job-queue.md)) found no idempotency guard on `runIngestionPass` — nothing stops a manual/admin-triggered run from racing an in-flight scheduled one. (The scheduler itself, `docker-compose.yml`'s `curl --max-time 600; sleep 1200` loop, can't overlap its own scheduled triggers — `sleep` only starts once `curl` returns — so the exposure is specifically a second, independently-triggered call, not back-to-back cron ticks.)

The ticket 06 grilling session's first instinct was to reuse the `pg_advisory_xact_lock` pattern `repositories/entity.ts` already established (ticket 04, `replaceStoryEntities`) — and the ticket's own Answer section originally said as much. That pattern doesn't transfer here. `entity.ts`'s lock wraps one short `prisma.$transaction` callback that does only DB writes — transaction-scoped, released automatically at commit, entirely safe to hold. `runIngestionPass` is a long-running function making many separate calls: DB reads/writes *and* external network calls (RSS feed fetches, OpenAI embedding calls per item). Two problems rule out an advisory lock here:

- **`pg_try_advisory_xact_lock`** (transaction-scoped) would require wrapping the *entire* pass — including every external HTTP call — in one long-lived `prisma.$transaction`, holding a DB connection open across network round trips it has no relationship to. That's a real risk of connection-pool exhaustion and transaction timeouts, not a theoretical one, for a pass that already does per-item embedding calls sequentially.
- **`pg_try_advisory_lock`** (session-scoped) doesn't have that problem, but requires staying on the *same* underlying connection for acquire and release. Prisma's pooled client doesn't reliably guarantee that across separate calls issued over the course of a long function — acquire and release could silently land on different connections, breaking the lock's own guarantee.

## Decision
`IngestionRunLock` is a single-row lease, not an advisory lock: `{ id: 'ingestion', runningSince, runId }`, seeded once by its migration. Claiming and releasing are each one short, atomic conditional `UPDATE` — the same idiom this codebase already uses for `updateAnalysisStatusIfCurrently`/`updateStoryRelationStatusIfCurrently` (an `UPDATE ... WHERE <still-in-the-expected-state>`, letting Postgres's own row-level locking serialize two racing callers so at most one can ever match). Claim: `UPDATE ... WHERE runningSince IS NULL OR runningSince < staleThreshold`. Release: `UPDATE ... WHERE runId = <the caller's own id>` — guarding against a run whose lease was already reclaimed as stale from clobbering the new holder's lease when it finally reaches its own cleanup.

`staleAfterMinutes` (30, well past any realistic pass duration) lets a later trigger reclaim an abandoned lease if a previous run crashed before releasing it, rather than deadlocking ingestion forever.

## Consequences
- No DB transaction is ever held open across an external network call — the lease's own critical section is two independent, millisecond-scale statements (claim, release), with the entire multi-minute body of `runIngestionPass` running outside any transaction or held lock in between.
- A stuck lease (crash without release) self-heals on the next trigger after `staleAfterMinutes`, without operator intervention — an advisory lock tied to a dead session would have released automatically on connection close, which this row-lease approach deliberately trades away for connection-pool safety; the trade-off is a lease that can, in the worst case, block a legitimate run for up to `staleAfterMinutes` after a crash, rather than an advisory lock that would release instantly but couldn't be held safely in the first place.
- This is specific to `runIngestionPass`'s own shape (long-running, externally-calling). A future singleton job with a genuinely short, DB-only critical section should default to the `entity.ts` transaction-scoped advisory-lock pattern instead — this ADR doesn't generalize "never use advisory locks," only that this particular job doesn't fit one.
